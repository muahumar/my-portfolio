'use strict';
// Netlify Function wrapper: runs the same request handler as `npm start`.
const serverless = require('serverless-http');
const { handler } = require('../../blog/server');

module.exports.handler = serverless(handler, {
  binary: (headers) => /^image\//.test(String((headers && headers['content-type']) || '')),
});
