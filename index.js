/**
 * publish-release
 * Create GitHub releases with assets
 *
 * @author Zach Bruggeman <mail@bruggie.com>
 */

var EventEmitter = require('events').EventEmitter
var fs           = require('fs')
var path         = require('path')

var async    = require('async')
var mime     = require('mime')
var progress = require('progress-stream')
var request  = require('request')

const DEFAULT_API_ROOT = 'https://api.github.com'

var pkg = require('./package.json')


function noop(){}


function PublishRelease (opts, cb) {
  opts = opts || {}
  cb   = cb   || noop

  var emitter = new EventEmitter()

  // validate opts
  var missing = []

  ;['token', 'repo', 'owner', 'tag'].forEach(function validateOpts (opt) {
    if (!opts[opt]) {
      missing.push(opt)
    }
  })

  if (missing.length > 0) {
    return cb(new Error('missing required options: ' + missing.join(', ')))
  }

  // Validate assets
  var assets = opts.assets || []

  async.every(assets, fs.exists, function(error, result)
  {
    if(error) return cb(error)
    if(!result) return cb(new Error('There are some missing assets'))

    // Create release
    var headers =
    {
      'Authorization': 'token ' + opts.token,
      'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
    }

    emitter.emit('create-release')

    request({
      uri: util.format((opts.apiUrl || DEFAULT_API_ROOT) + '/repos/%s/%s/releases', opts.owner, opts.repo),
      method: 'POST',
      json: true,
      body: {
        tag_name: opts.tag,
        name: opts.name,
        body: opts.notes,
        draft: !!opts.draft,
        prerelease: !!opts.prerelease
      },
      headers: headers
    },
    function (err, res, obj) {
      if (err) return cb(err)

      emitter.emit('created-release')

      // Upload assets
      if (!assets.length) return cb()

      async.eachSeries(assets, function (asset, callback) {
        var fileName = path.basename(asset)

        emitter.emit('upload-asset', fileName)

        var rd = fs.createReadStream(asset)
        .on('error', callback)

        var stat = fs.statSync(asset)

        headers['Content-Length'] = stat.size
        headers['Content-Type'  ] = mime.lookup(fileName)

        var us = request(
        {
          method: 'POST',
          uri: obj.createRelease.upload_url.split('{')[0] + '?name=' + fileName,
          headers: headers
        })
        .on('error', callback)
        .on('end', function () {
          emitter.emit('uploaded-asset', fileName)
          callback()
        })

        var prog = progress(
        {
          length: stat.size,
          time: 100
        },
        function (p) {
          emitter.emit('upload-progress', fileName, p)
        })

        rd.pipe(prog).pipe(us)
      },
      cb)
    })
  })

  return emitter
}


module.exports = PublishRelease
