const axios = require('axios');

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

module.exports = { deleteComment };
