const axios = require('axios');

/**
 * Instagram comments delivered via the "Instagram API with Instagram
 * Login" product go through graph.instagram.com (the documented base
 * URL for that token type); Facebook Page comments go through
 * graph.facebook.com. The token itself is always passed in by the
 * caller -- each client (see services/clients.js) has their own Page/IG
 * tokens, so this module has no notion of a single global credential.
 */
function baseUrlFor(platform) {
  const version = process.env.GRAPH_API_VERSION || 'v19.0';
  return platform === 'instagram'
    ? `https://graph.instagram.com/${version}`
    : `https://graph.facebook.com/${version}`;
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
async function getCommentText(commentId, platform, token) {
  const url = `${baseUrlFor(platform)}/${commentId}`;

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
 * Deletes a comment via the Graph API. Returns { ok, error } rather than
 * throwing so the caller (automatic moderation, or a manual delete from
 * the dashboard) can log and move on, or show the specific failure
 * reason to a human, instead of the whole batch/request failing.
 */
async function deleteComment(commentId, platform, token) {
  const url = `${baseUrlFor(platform)}/${commentId}`;

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

module.exports = { getCommentText, deleteComment };
