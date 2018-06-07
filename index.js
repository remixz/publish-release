/**
 * publish-release
 * Create GitHub releases with assets
 *
 * @author Zach Bruggeman <mail@bruggie.com>
 */

var request = require('request')
var async = require('async')
var mime = require('mime')
var progress = require('progress-stream')
var util = require('util')
var fs = require('fs')
var path = require('path')
var EventEmitter = require('events').EventEmitter
var pkg = require('./package.json')

var DEFAULT_API_ROOT = 'https://api.github.com'

function PublishRelease (opts, cb) {
  if (!(this instanceof PublishRelease)) return new PublishRelease(opts, cb)

  this.opts = (opts || {})
  this.cb = (cb || function noop () {})

  this.publish()
}

util.inherits(PublishRelease, EventEmitter)

PublishRelease.prototype.publish = function publish () {
  var self = this
  var opts = this.opts
  var cb = this.cb

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

  if (!opts.skipAssetsCheck && opts.assets && opts.assets.length > 0) {
    try {
      opts.assets.forEach(function (f) {
        fs.accessSync(path.resolve(f))
      })
    } catch (err) {
      cb(new Error('missing asset ' + err.path))
    }
  }

  async.auto({
    createRelease: function createRelease (callback) {
      var ghReleaseUri = util.format((opts.apiUrl || DEFAULT_API_ROOT) + '/repos/%s/%s/releases', opts.owner, opts.repo)

      function requestCreateRelease () {
        self.emit('create-release')
        var reqDetails = {
          uri: ghReleaseUri,
          method: 'POST',
          json: true,
          body: {
            tag_name: opts.tag,
            target_commitish: opts.target_commitish,
            name: opts.name,
            body: opts.notes,
            draft: !!opts.draft,
            prerelease: !!opts.prerelease
          },
          headers: {
            'Authorization': 'token ' + opts.token,
            'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
          }
        }
        request(reqDetails, function (err, res, body) {
          if (err) {
            // handle a real error, eg network fail
            // will be handled by asyncAutoCallback
            return callback(err)
          }
          var errorStatus = res.statusCode >= 400 && res.statusCode < 600
          if (errorStatus) {
            // handle an http error status
            // will be handled by asyncAutoCallback
            var e = new Error('Error status: ' + res.statusCode + '  response body:' + JSON.stringify(body) + '\n request details:' + JSON.stringify(reqDetails, null, 2))
            return callback(e)
          }
          self.emit('created-release')
          callback(null, body)
        })
      }

      if (opts.reuseRelease) {
        /**
         * https://github.com/remixz/publish-release/issues/31
         * We don't use "Get a release by tag name" because "tag name" means existing git tag,
         * but we can draft release and don't create git tag
         */
        request({
          uri: ghReleaseUri,
          method: 'GET',
          json: true,
          headers: {
            'Authorization': 'token ' + opts.token,
            'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
          }
        }, function (err, res, body) {
          if (err) return callback(err) // will be handled by asyncAutoCallback

          var bodyReturn = null

          async.eachSeries(body, function (el, callback) {
            if (el.tag_name === opts.tag) {
              bodyReturn = el
              return
            }
            callback()
          })

          var statusOk = res.statusCode >= 200 && res.statusCode < 300
          var hasReleaseMatchingTag = bodyReturn && bodyReturn.tag_name === opts.tag
          var canReuse = !opts.reuseDraftOnly || (bodyReturn && bodyReturn.draft)

          if (statusOk && hasReleaseMatchingTag && canReuse) {
            self.emit('reuse-release')
            bodyReturn.allowReuse = true // allow to editRelease
            callback(null, bodyReturn)
          } else if (!hasReleaseMatchingTag || hasReleaseMatchingTag && !opts.skipIfPublished) {
            requestCreateRelease()
          }
        })
      } else {
        requestCreateRelease()
      }
    },

    editRelease: ['createRelease', function editRelease (callback, obj) {
      if (obj.createRelease.errors || !obj.createRelease.url) return callback()

      if (opts.editRelease && obj.createRelease.allowReuse) {
        self.emit('edit-release', obj.createRelease)
        const editUri = obj.createRelease.url

        const reqDetails = {
          uri: editUri,
          method: 'PATCH',
          json: true,
          body: {
            tag_name: opts.tag,
            target_commitish: opts.target_commitish,
            name: opts.name,
            body: opts.notes,
            draft: !!opts.draft,
            prerelease: !!opts.prerelease
          },
          headers: {
            'Authorization': 'token ' + opts.token,
            'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
          }
        }
        request(reqDetails, function (err, res, body) {
          if (err) {
            // handle a real error, eg network fail
            // will be handled by asyncAutoCallback
            return callback(err)
          }
          var errorStatus = res.statusCode >= 400 && res.statusCode < 600
          if (errorStatus) {
            // handle an http error status
            // will be handled by asyncAutoCallback
            var e = new Error('Error status: ' + res.statusCode + '  response body:' + JSON.stringify(body) + '\n request details:' + JSON.stringify(reqDetails, null, 2))
            return callback(e)
          }

          self.emit('edited-release', body)
          callback(null, body)
        })
      } else {
        callback()
      }
    }],

    deleteEmptyTag: ['createRelease', 'editRelease', function deleteEmptyTag (callback, obj) {
      if (!obj.editRelease) return callback()
      /**
       * Compare if it's going from release/prerelease to tag
       * to delete empty unused tag, checking if it's now draft and was not draft
       */
      if (opts.deleteEmptyTag && obj.editRelease.draft && !obj.createRelease.draft) {
        var deleteTagUri = util.format((opts.apiUrl || DEFAULT_API_ROOT) + '/repos/%s/%s/git/refs/tags/%s', opts.owner, opts.repo, obj.createRelease.tag_name)

        const reqDetails = {
          uri: deleteTagUri,
          method: 'DELETE',
          json: true,
          headers: {
            'Authorization': 'token ' + opts.token,
            'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
          }
        }
        request(reqDetails, function (err, res, body) {
          if (err) {
            // handle a real error, eg network fail
            // will be handled by asyncAutoCallback
            return callback(err)
          }
          var errorStatus = res.statusCode >= 400 && res.statusCode < 600
          if (errorStatus) {
            // handle an http error status
            // will be handled by asyncAutoCallback
            var e = new Error('Error status: ' + res.statusCode + '  response body:' + JSON.stringify(body) + '\n request details:' + JSON.stringify(reqDetails, null, 2))
            return callback(e)
          }

          self.emit('deleted-tag-release', obj.createRelease.tag_name)
          callback(null, body)
        })
      } else {
        callback()
      }
    }],

    uploadAssets: ['createRelease', 'editRelease', 'deleteEmptyTag', function uploadAssets (callback, obj) {
      if (!opts.assets || opts.assets.length === 0) return callback()
      if (obj.createRelease.errors || !obj.createRelease.upload_url) return callback(obj.createRelease)

      async.eachSeries(opts.assets, function (asset, callback) {
        var fileName = path.basename(asset)
        var uploadUri = obj.createRelease.upload_url.split('{')[0] + '?name=' + fileName

        requestUploadAsset()

        function requestUploadAsset () {
          self.emit('upload-asset', fileName)

          var stat = fs.statSync(asset)
          var rd = fs.createReadStream(asset)
          var us = request({
            method: 'POST',
            uri: uploadUri,
            headers: {
              'Authorization': 'token ' + opts.token,
              'Content-Type': mime.lookup(fileName),
              'Content-Length': stat.size,
              'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
            }
          }, function (err, res, body) {
            if (err) return callback(err)

            const bodyJson = JSON.parse(body)
            if (res.statusCode === 422 && bodyJson.errors && bodyJson.errors[0].code === 'already_exists') {
              self.emit('duplicated-asset', fileName)

              if (!opts.skipDuplicatedAssets) {
                async.eachSeries(obj.createRelease.assets, function (el, callback) {
                  if (fileName === el.name) {
                    const deleteAssetUri = obj.createRelease.url.split('/').slice(0, -1).join('/') + '/assets/' + el.id

                    request({
                      method: 'DELETE',
                      uri: deleteAssetUri,
                      headers: {
                        'Authorization': 'token ' + opts.token,
                        'User-Agent': 'publish-release ' + pkg.version + ' (https://github.com/remixz/publish-release)'
                      }
                    }, function (err, res, body) {
                      if (err) return callback(err)

                      self.emit('duplicated-asset-deleted', fileName)
                      requestUploadAsset()
                      callback()
                    })
                  } else {
                    callback()
                  }
                })
              } else {
                callback()
              }
            } else {
              self.emit('uploaded-asset', fileName)
              callback()
            }
          })

          var prog = progress({
              length: stat.size,
              time: 100
          }, function (p) {
            self.emit('upload-progress', fileName, p)
          })

          rd.on('error', function (err) {
            return callback(err)  // will be handled by asyncAutoCallback
          })

          rd.pipe(prog).pipe(us)
        }
      }, function (err) {
        return callback(err) // will be handled by asyncAutoCallback
      })
    }]
  }, function asyncAutoCallback (err, obj) {
    if (err) {
      // make sure we do not leak the Github auth token
      err.message = err.message.replace(new RegExp(opts.token, 'g'), '****')
      // we are an EventEmitter so emit the 'error' event so the caller knows we failed.
      self.emit('error', err)
      // just run the callback with no info. dont run cb(err) beacuse as an EventEmitter this creates a
      // throw Error('Uncaught, unspecified "error" event.')
      // and that error message isn't helpful to anyone
      return cb()
    }
    // otherwise
    cb(null, obj.createRelease)
  })
}

module.exports = PublishRelease
