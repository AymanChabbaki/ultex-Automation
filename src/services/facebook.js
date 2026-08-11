const axios = require('axios');

/**
 * Fetches a comment's text. The webhook payload for this Graph API
 * version doesn't include the comment message inline, so it has to be
 * looked up separately before it can be sent to the moderation model.
 * Returns null if the comment is unavailable (e.g. already deleted by
 * the author before this call runs).
 */
async function getCommentText(commentId) {
  const version = process.env.GRAPH_API_VERSION || 'v19.0';
  const url = `https://graph.facebook.com/${version}/${commentId}`;

  try {
    const response = await axios.get(url, {
      params: { fields: 'message', access_token: process.env.PAGE_ACCESS_TOKEN },
    });
    return typeof response.data.message === 'string' ? response.data.message : null;
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
async function deleteComment(commentId) {
  const version = process.env.GRAPH_API_VERSION || 'v19.0';
  const url = `https://graph.facebook.com/${version}/${commentId}`;

  try {
    await axios.delete(url, {
      params: { access_token: process.env.PAGE_ACCESS_TOKEN },
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
