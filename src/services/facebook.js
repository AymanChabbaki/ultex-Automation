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
 * Facebook comment IDs are structured as "<page_id>_<post_id>_<comment_id>"
 * (a reply appends further segments), so the post it belongs to can be
 * derived without an extra API call by joining the first two segments --
 * Facebook resolves "facebook.com/<page_id>_<post_id>" directly to the
 * post. Used as a fallback for when the Graph API omits `permalink_url`
 * from the comment response, which it does silently (no error) rather
 * than include it, for tokens/comments it won't grant that field to.
 */
function fallbackFacebookPostLink(commentId) {
  const [pageId, postId] = commentId.split('_');
  if (!pageId || !postId) return null;
  return `https://www.facebook.com/${pageId}_${postId}`;
}

/**
 * Fetches a comment's text and a link back to the post/media it's on.
 * The webhook payload for this Graph API version doesn't include the
 * comment text inline, so it has to be looked up separately before it
 * can be sent to the moderation model. Requests both `message`
 * (Facebook Page comments) and `text` (Instagram comments) since the
 * two platforms name the field differently on the same underlying
 * comment-object endpoint. `permalink_url` covers Facebook; Instagram
 * has no such field on the comment itself, so its post link comes from
 * the parent media object's `permalink` instead.
 * Returns { text: null, postLink: null } if the comment is unavailable
 * (e.g. already deleted by the author before this call runs).
 */
async function getCommentDetails(commentId, platform) {
  const { base, token } = targetFor(platform);
  const url = `${base}/${commentId}`;
  const fields = platform === 'instagram' ? 'text,media{permalink}' : 'message,text,permalink_url';

  try {
    const response = await axios.get(url, {
      params: { fields, access_token: token },
    });
    const { message, text, permalink_url, media } = response.data;
    const commentText = typeof message === 'string' ? message : (typeof text === 'string' ? text : null);
    const postLink = permalink_url || media?.permalink ||
      (platform === 'facebook' ? fallbackFacebookPostLink(commentId) : null);
    return { text: commentText, postLink };
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`Failed to fetch comment ${commentId}:`, detail);
    return { text: null, postLink: platform === 'facebook' ? fallbackFacebookPostLink(commentId) : null };
  }
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
