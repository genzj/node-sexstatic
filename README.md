# Node-Sexstatic

A simple static file server middleware. Use it with a raw http server,
express/connect, or flatiron/union!

Also adds the ability to arbitrarily modify output HTML for whatever reason.
And adding additional:
  simple url -> string handlers
  simple url -> function handlers

see opts.extras if you wanna get what i'm talking about

I may or may not extend this with further addons in the future to suit my needs.

# New stuff
```js
var sexstatic = require('node-sexstatic');
var http = require('http'),
opts = require('minimist')(process.argv.slice(2)),
port = opts.port || opts.p || 8000,
dir = opts.root || opts._[0] || process.cwd();

// new feature #1
opts.modifyFunctions = [
  function test(c) {
    console.log('hello contents');
    return c;
  }
];

// new feature #2
opts.extras = {
  'service.html': '<b>oh hello</b>',
  'service.json': {
    'content-type': 'text/json',
    'content': function() {
      return { args: process.argv };
    }
  },
  'service.rpc': {
    'content-type': 'text/plain',
    content: function() {
      var well = '-- lmao';
      return function() {
        return '~* so meta '+well+'*~';
      };
    }
  }
};

if (opts.help || opts.h) {
  var u = console.error;
  u('usage: sexstatic [dir] {options} --port PORT');
  u('see https://npm.im/sexstatic for more docs');
  return;
}

http.createServer(sexstatic(dir, opts))
.listen(port, function () {
  console.log('sexstatic serving ' + dir + ' at http://0.0.0.0:' + port);
});
```

# Examples:

## express 3.0.x

``` js
var http = require('http');
var express = require('express');
var sexstatic = require('sexstatic');

var app = express();
app.use(sexstatic({ root: __dirname + '/public' }));
http.createServer(app).listen(8080);

console.log('Listening on :8080');
```

## union

``` js
var union = require('union');
var sexstatic = require('sexstatic');

function inject_script(src)
{
  var index = src.indexOf("</body");
  if (index == -1) return src;
  var out = src.substr(0, index);
  out += '<script type="text/javascript" src="hello-world.js"></script>' + src.substr(index);
  return out;
}

union.createServer({
  before: [
    sexstatic({ root: __dirname + '/public', modifyFunctions: [ inject_script ] }),
  ]
}).listen(8080);

console.log('Listening on :8080');
```

### fall through
To allow fall through to your custom routes:

```js
sexstatic({ root: __dirname + '/public', handleError: false })
```

# API:

## sexstatic(opts);

Pass sexstatic an options hash, and it will return your middleware!

```js
var opts = {
             root          : __dirname + '/public',
             baseDir       : '/',
             cache         : 3600,
             showDir       : true,
             autoIndex     : false,
             humanReadable : true,
             si            : false,
             defaultExt    : 'html',
             gzip          : false,
             modifyFunctions      : [],
             extras: {...}
           }
```

If `opts` is a string, the string is assigned to the root folder and all other
options are set to their defaults.

### `opts.root`

`opts.root` is the directory you want to serve up.

### `opts.baseDir`

`opts.baseDir` is `/` by default, but can be changed to allow your static files
to be served off a specific route. For example, if `opts.baseDir === "blog"`
and `opts.root = "./public"`, requests for `localhost:8080/blog/index.html` will
resolve to `./public/index.html`.

### `opts.cache`

Customize cache control with `opts.cache` , if it is a number then it will set max-age in seconds.
Other wise it will pass through directly to cache-control. Time defaults to 3600 s (ie, 1 hour).

### `opts.showDir`

Turn **off** directory listings with `opts.showDir === false`. Defaults to **true**.

### `opts.humanReadable`

If showDir is enabled, add human-readable file sizes. Defaults to **true**.
Aliases are `humanreadable` and `human-readable`.

### `opts.si`

If showDir and humanReadable are enabled, print file sizes with base 1000 instead
of base 1024. Name is inferred from cli options for `ls`. Aliased to `index`, the
equivalent option in Apache.

### `opts.autoIndex`

Serve `/path/index.html` when `/path/` is requested.
Turn **off** autoIndexing with `opts.autoIndex === false`. Defaults to **true**.

### `opts.defaultExt`

Turn on default file extensions with `opts.defaultExt`. If `opts.defaultExt` is
true, it will default to `html`. For example if you want a request to `/a-file`
to resolve to `./public/a-file.html`, set this to `true`. If you want
`/a-file` to resolve to `./public/a-file.json` instead, set `opts.defaultExt` to
`json`.

### `opts.gzip`

Set `opts.gzip === true` in order to turn on "gzip mode," wherein sexstatic will
serve `./public/some-file.js.gz` in place of `./public/some-file.js` when the
gzipped version exists and sexstatic determines that the behavior is appropriate.

### `opts.handleError`

Turn **off** handleErrors to allow fall-through with `opts.handleError === false`, Defaults to **true**.

### `opts.modifyFunctions`

Passes an array of functions that will be performed on HTML text before it's sent to the client.

### `opts.extras`

Passes a dictionary containing additional static, but internal files kept as strings that sexstatic will
be able to serve. ex:

```js
  ecstatic({
  root: this.root,
  cache: this.cache,
  showDir: this.showDir,
  autoIndex: this.autoIndex,
  defaultExt: this.ext,
  modifyFunctions: [
  addReloadScript
  ],
  extras: {
    'http-test.js': "file contents",
    'ws.json': {
      'content-type': 'text/json',
      'content': JSON.stringify({
        port: 8086,
        path: this.root,
        additional: "what happens in vegas, stays in vegas."
        })
      }
    }
  })
```

## middleware(req, res, next);

This works more or less as you'd expect.

### sexstatic.showDir(folder);

This returns another middleware which will attempt to show a directory view. Turning on auto-indexing is roughly equivalent to adding this middleware after an sexstatic middleware with autoindexing disabled.

### `sexstatic` command

to start a standalone static http server,
run `npm install -g sexstatic` and then run `sexstatic [dir?] [options] --port PORT`
all options work as above, passed in [optimist](https://github.com/substack/node-optimist) style.
`port` defaults to `8000`. If a `dir` or `--root dir` argument is not passed, ecsatic will
serve the current dir.

# Contribute:

Don't! Contribute back to the project that this module is forked from. This module is built for a specific use
case and I'd rather not care about the parent.. Go ahead and use it for your projects though, if you'd
like.

# License:

MIT.
