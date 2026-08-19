const axios = require('axios');

/**
 * Instagram comments delivered via the separate "Instagram API with
 * Instagram Login" product belong to a different app identity than the
 * Page -- PAGE_ACCESS_TOKEN has no permission over them. Those need
 * IG_ACCESS_TOKEN (generated in that product's own setup screen) against
 * graph.instagram.com, the documented base URL for that token type.
 * Falls back to the classic Page-linked path (PAGE_ACCESS_TOKEN against
 * graph.facebook.com) if IG_ACCESS_TOKEN isn't set, for setups using the
 * classic flow instead.
 */
function targetFor(platform) {
  const version = process.env.GRAPH_API_VERSION || 'v19.0';
  if (platform === 'instagram' && process.env.IG_ACCESS_TOKEN) {
    return { base: `https://graph.instagram.com/${version}`, token: process.env.IG_ACCESS_TOKEN };
  }
  return { base: `https://graph.facebook.com/${version}`, token: process.env.PAGE_ACCESS_TOKEN };
}

/**
 * Facebook comment IDs are usually structured as
 * "<page_id>_<post_id>_<comment_id>", so the post's own ID can normally
 * be derived by joining the first two segments without an extra API
 * call. Only used as a last resort when the webhook didn't hand us the
 * real post_id -- unlike that value, this is a guess based on an ID
 * shape Meta doesn't document as stable, so it can point at the wrong
 * (or a non-existent) object for some comment/post types.
 */
function guessFacebookPostId(commentId) {
  const [pageId, postId] = commentId.split('_');
  return pageId && postId ? `${pageId}_${postId}` : null;
}

/**
 * Looks up a Facebook post's own canonical permalink_url. This is the
 * reliable source for a Facebook post link -- the equivalent field on
 * the *comment* object (requested in getCommentDetails below) comes
 * back empty for some tokens/comments without erroring, and guessing
 * the URL shape from the post ID directly (facebook.com/<post_id>)
 * doesn't resolve for every post type (e.g. some photo/video posts).
 */
async function getPostPermalink(postId, base, token) {
  try {
    const response = await axios.get(`${base}/${postId}`, {
      params: { fields: 'permalink_url', access_token: token },
    });
    return response.data.permalink_url || null;
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`Failed to fetch post ${postId} permalink:`, detail);
    return null;
  }
}

/**
 * Fetches a comment's text and a link back to the post/media it's on.
 * The webhook payload for this Graph API version doesn't include the
 * comment text inline, so it has to be looked up separately before it
 * can be sent to the moderation model. Requests both `message`
 * (Facebook Page comments) and `text` (Instagram comments) since the
 * two platforms name the field differently on the same underlying
 * comment-object endpoint. Instagram's post link comes from the parent
 * media object's `permalink`. Facebook's comment-level `permalink_url`
 * is requested too but isn't reliably populated, so it falls back to
 * looking up the parent post's own permalink_url via `postId` (passed
 * in from the webhook payload where available).
 * Returns { text: null, postLink: null } if the comment is unavailable
 * (e.g. already deleted by the author before this call runs).
 */
async function getCommentDetails(commentId, platform, postId) {
  const { base, token } = targetFor(platform);
  const url = `${base}/${commentId}`;
  const fields = platform === 'instagram' ? 'text,media{permalink}' : 'message,text,permalink_url';

  let commentText = null;
  let postLink = null;

  try {
    const response = await axios.get(url, {
      params: { fields, access_token: token },
    });
    const { message, text, permalink_url, media } = response.data;
    commentText = typeof message === 'string' ? message : (typeof text === 'string' ? text : null);
    postLink = permalink_url || media?.permalink || null;
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`Failed to fetch comment ${commentId}:`, detail);
  }

  if (!postLink && platform === 'facebook') {
    const resolvedPostId = postId || guessFacebookPostId(commentId);
    if (resolvedPostId) {
      postLink = await getPostPermalink(resolvedPostId, base, token);
    }
  }

  return { text: commentText, postLink };
}

/**
 * Deletes a comment via the Graph API. Returns { ok, error } rather than
 * throwing so the caller (automatic moderation, or a manual delete from
 * the dashboard) can log and move on, or show the specific failure
 * reason to a human, instead of the whole batch/request failing.
 */
async function deleteComment(commentId, platform) {
  const { base, token } = targetFor(platform);
  const url = `${base}/${commentId}`;

  try {
    await axios.delete(url, {
      params: { access_token: token },
    });
    console.log(`Deleted comment ${commentId}`);
    return { ok: true };
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.response?.data || error.message;
    console.error(`Failed to delete comment ${commentId}:`, detail);
    return { ok: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  }
}

module.exports = { getCommentDetails, deleteComment };
