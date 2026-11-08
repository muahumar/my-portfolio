'use strict';
// Netlify Function wrapper: runs the same request handler as `npm start`.
const serverless = require('serverless-http');
const { handler } = require('../../blog/server');

const run = serverless(handler, {
  binary: (headers) => /^image\//.test(String((headers && headers['content-type']) || '')),
});

// Behind a redirect/rewrite, event.path can be the function path
// (/.netlify/functions/web) rather than what the visitor requested.
// rawUrl always holds the original URL, so route on that.
module.exports.handler = async (event, context) => {
  try {
    if (event.rawUrl) {
      const u = new URL(event.rawUrl);
      event.path = u.pathname;
      event.rawPath = u.pathname;
      event.rawQueryString = u.search.replace(/^\?/, '');
    }
  } catch { /* fall back to event.path */ }
  return run(event, context);
};
