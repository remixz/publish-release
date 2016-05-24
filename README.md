## publish-release


Create GitHub releases with assets from CLI, or from JS.

[![Build Status](https://travis-ci.org/remixz/publish-release.svg?branch=master)](https://travis-ci.org/remixz/publish-release)

[![js-standard-style](https://raw.githubusercontent.com/feross/standard/master/badge.png)](https://github.com/feross/standard)

### Installation

[![NPM](https://nodei.co/npm/publish-release.png)](https://nodei.co/npm/publish-release/)

```
npm install --save publish-release
npm install -g publish-release # CLI
```

### CLI Usage

The CLI looks in 2 places for configuration: arguments passed, and a `publishRelease` object (see the [API usage](#api-usage) below for the format) in the `package.json`. If it can't find the info it needs from those places, it will run a wizard. This means that you can create a release just by running `publish-release`, and following the wizard.

```
$ publish-release --help
Usage: publish-release {options}

Options:

  --token [token]                 GitHub oAuth token.

  --owner [owner]                 GitHub owner of the repository.
                                  Defaults to parsing repository field in
                                  the project's package.json

  --repo [repo]                   GitHub repository name.
                                  Defaults to parsing repository field in
                                  the project's package.json

  --tag [tag]                     Git tag to base the release off of.
                                  Defaults to latest tag.

  --name [name]                   Name of the new release.
                                  Defaults to the name field in the
                                  package.json, plus the git tag.

  --notes [notes]                 Notes to add to release, written in Markdown.
                                  Defaults to opening the $EDITOR.

  --template [path to template]   Markdown file to open for editing notes.
                                  Will open the template in $EDITOR.

  --draft                         Pass this flag to set the release as a draft.

  --prerelease                    Pass this flag to set the release as a
                                  prerelease.

  --reuseRelease                  Pass this flag if you don't want the plugin to create a new release if one already
                                  exists for the given tag.

  --reuseDraftOnly                Pass this flag if you only want to reuse a release if it's a draft. It prevents
                                  you from editing already published releases.

  --skipAssetChecks               Don't check if assets exist or not. False by default.

  --assets [files]                Comma-separated list of filenames.
                                  Ex: --assets foo.txt,bar.zip

  --apiUrl [apiurl]               Use a custom API URL to connect to GitHub Enterprise instead of github.com.
                                  Defaults to "https://api.github.com"
                                  Ex: --apiUrl "https://myGHEserver/api/v3"

  --target_commitish [commitish]  Specifies the commitish value that determines where the Git tag is created from. Can be any branch or commit SHA.
                                  Defaults to the default branch of the repository.
                                  Ex: --target_commitish "master"
```

### API Usage

Using it from the API will not inherit any configuration properties from other sources (i.e. the package.json), and requires you to pass all properties in yourself.

```js
var publishRelease = require('publish-release')

publishRelease({
  token: 'token',
  owner: 'remixz',
  repo: 'publish-release',
  tag: 'v1.0.0',
  name: 'publish-release v1.0.0',
  notes: 'very good!',
  draft: false,
  prerelease: false,
  reuseRelease: true,
  reuseDraftOnly: true,
  assets: ['/absolute/path/to/file'],
  apiUrl: 'https://myGHEserver/api/v3',
  target_commitish: 'master'
}, function (err, release) {
  // `release`: object returned from github about the newly created release
})
```

`publish-release` emits the following events on the API:

* `create-release` - Emits before the request is made to create the release.
* `created-release` - Emits after the request is made successfully.
* `reuse-release` - Emits if, instead of creating a new release, the assets will be uploaded to an existing one (if one can be found for the given tag).
* `upload-asset` - `{name}` - Emits before an asset file starts uploading. Emits the `name` of the file.
* `upload-progress` - `{name, progress}` - Emits while a file is uploading. Emits the `name` of the file, and a `progress` object from [`progress-stream`](https://github.com/freeall/progress-stream).
* `uploaded-asset` - `{name}` - Emits after an asset file is successfully uploaded. Emits the `name` of the file.

### Usage with Gulp

Please see the Gulp version of this module: https://github.com/Aluxian/gulp-github-release
