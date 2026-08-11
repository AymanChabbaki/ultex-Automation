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
 * Fetches a comment's text. The webhook payload for this Graph API
 * version doesn't include the comment text inline, so it has to be
 * looked up separately before it can be sent to the moderation model.
 * Requests both `message` (Facebook Page comments) and `text`
 * (Instagram comments) since the two platforms name the field
 * differently on the same underlying comment-object endpoint.
 * Returns null if the comment is unavailable (e.g. already deleted by
 * the author before this call runs).
 */
async function getCommentText(commentId, platform) {
  const { base, token } = targetFor(platform);
  const url = `${base}/${commentId}`;

  try {
    const response = await axios.get(url, {
      params: { fields: 'message,text', access_token: token },
    });
    const { message, text } = response.data;
    if (typeof message === 'string') return message;
    if (typeof text === 'string') return text;
    return null;
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`Failed to fetch comment ${commentId}:`, detail);
    return null;
  }
}

/**
 * Deletes a comment via the Graph API. Returns false (rather than
 * throwing) on failure so the caller can log and move on to the next
 * webhook event instead of the whole batch failing.
 */
async function deleteComment(commentId, platform) {
  const { base, token } = targetFor(platform);
  const url = `${base}/${commentId}`;

  try {
    await axios.delete(url, {
      params: { access_token: token },
    });
    console.log(`Deleted comment ${commentId}`);
    return true;
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error(`Failed to delete comment ${commentId}:`, detail);
    return false;
  }
}

module.exports = { getCommentText, deleteComment };
