#! /usr/bin/env node

var path = require('path'),
    fs = require('fs'),
    url = require('url'),
    mime = require('mime'),
    showDir = require('./sexstatic/showdir'),
    version = JSON.parse(
      fs.readFileSync(__dirname + '/../package.json').toString()
    ).version,
    status = require('./sexstatic/status-handlers'),
    etag = require('./sexstatic/etag'),
    optsParser = require('./sexstatic/opts');

var sexstatic = module.exports = function (dir, options) {
  if (typeof dir !== 'string') {
    options = dir;
    dir = options.root;
  }

  var root = path.join(path.resolve(dir), '/'),
      opts = optsParser(options),
      cache = opts.cache,
      autoIndex = opts.autoIndex,
      baseDir = opts.baseDir,
      defaultExt = opts.defaultExt,
      handleError = opts.handleError,
      modifyFunctions = options.modifyFunctions || [];

  opts.root = dir;
  if (defaultExt && /^\./.test(defaultExt)) defaultExt = defaultExt.replace(/^\./, '');

  return function middleware (req, res, next) {

    // Strip any null bytes from the url
    while(req.url.indexOf('%00') !== -1) {
      req.url = req.url.replace(/\%00/g, '');
    }
    // Figure out the path for the file from the given url
    var parsed = url.parse(req.url);
    try {
      decodeURIComponent(req.url); // check validity of url
      var pathname = decodePathname(parsed.pathname);
    }
    catch (err) {
      return status[400](res, next, { error: err });
    }

    var file = path.normalize(
          path.join(root,
            path.relative(
              path.join('/', baseDir),
              pathname
            )
          )
        ),
        gzipped = file + '.gz';

    // Set common headers.
    res.setHeader('server', 'sexstatic-'+version);

    // TODO: This check is broken, which causes the 403 on the
    // expected 404.
    if (file.slice(0, root.length) !== root) {
      return status[403](res, next);
    }

    if (req.method && (req.method !== 'GET' && req.method !== 'HEAD' )) {
      return status[405](res, next);
    }

    function statFile() {
      fs.stat(file, function (err, stat) {
        if (err && err.code === 'ENOENT') {

          // Check if the file is in our opts.extras
          // and if so route it to the serve handler
          if (options.extras && Object.keys(options.extras).indexOf(path.basename(file)) != -1) {
            var extra = options.extras[path.basename(file)];
            var content = extra['content'] || extra;

            if (content && typeof(content) == 'string') {
              var output = new Buffer(extra['content'] || extra, 'utf-8');
              res.setHeader('content-type', extra['content-type'] || 'text/html');
              res.setHeader('content-length', Buffer.byteLength(content, 'utf-8'));
              res.end(output);

              return;
            } else if (content && typeof(content) == 'function') {
              var resp = content(req);

              var isJson = false;
              if (typeof(resp) === 'object')
              {
                isJson = true;
                resp = JSON.stringify(resp);
              } else if (typeof(resp) === 'function') {
                resp = resp();
              }

              // always be sure lol
              resp = resp.toString();

              var output = new Buffer(resp, 'utf-8');
              res.setHeader('content-type', extra['content-type'] || 'text/html');
              res.setHeader('content-length', Buffer.byteLength(resp, 'utf-8'));
              res.end(output);

              return;
            }
          }

          if (req.statusCode == 404) {
            // This means we're already trying ./404.html
            status[404](res, next);
          }
          else if (defaultExt && !path.extname(parsed.pathname).length) {
            //
            // If no file extension is specified and there is a default extension
            // try that before rendering 404.html.
            //
            middleware({
              url: parsed.pathname + '.' + defaultExt + ((parsed.search)? parsed.search:'')
            }, res, next);
          }
          else {
            // Try for ./404.html
            //
            // In order to make tests pass, we have to punch the status code
            // in both spots. It's stupid and mysterious, but at least we get
            // the behavior we want.
            //
            // TODO: Figure out what the Hell is going on and clean this up.
            res.statusCode = 404;
            middleware({
              url: (handleError ? ('/' + path.join(baseDir, '404.' + defaultExt)) : req.url),
              statusCode: 404
            }, res, next);
          }
        }
        else if (err) {
          status[500](res, next, { error: err });
        }
        else if (stat.isDirectory()) {
          // 302 to / if necessary
          if (!parsed.pathname.match(/\/$/)) {
            res.statusCode = 302;
            res.setHeader('location', parsed.pathname + '/' +
              (parsed.query? ('?' + parsed.query):'')
            );
            return res.end();
          }

          if (autoIndex) {
            return middleware({
              url: path.join(encodeURIComponent(pathname), '/index.' + defaultExt)
            }, res, function (err) {
              if (err) {
                return status[500](res, next, { error: err });
              }
              if (opts.showDir) {
                return showDir(opts, stat, modifyFunctions)(req, res);
              }

              return status[403](res, next);
            });
          }

          if (opts.showDir) {
            return showDir(opts, stat)(req, res);
          }

          status[404](res, next);

        }
        else {
          serve(stat);
        }
      });
    }

    // Look for a gzipped file if this is turned on
    if (opts.gzip && shouldCompress(req)) {
      fs.stat(gzipped, function (err, stat) {
        if (!err && stat.isFile()) {
          file = gzipped;
          return serve(stat);
        } else {
          statFile();
        }
      });
    } else {
      statFile();
    }

    function serve(stat) {
      // Do a MIME lookup, fall back to octet-stream and handle gzip
      // special case.
      var contentType = mime.lookup(file), charSet;

      if (contentType) {
        charSet = mime.charsets.lookup(contentType, 'utf-8');
        if (charSet) {
          contentType += '; charset=' + charSet;
        }
      }

      var isHtml = false;
      if (contentType.indexOf("text") != -1)
      {
        isHtml = true;
      }

      if (path.extname(file) === '.gz') {
        res.setHeader('Content-Encoding', 'gzip');

        // strip gz ending and lookup mime type
        contentType = mime.lookup(path.basename(file, ".gz"));
      }

      var range = (req.headers && req.headers['range']);
      if (range) {
        var total = stat.size;
        var parts = range.replace(/bytes=/, "").split("-");
        var partialstart = parts[0];
        var partialend = parts[1];
        var start = parseInt(partialstart, 10);
        var end = Math.min(total-1, partialend ? parseInt(partialend, 10) : total-1);
        var chunksize = (end-start)+1;
        if (start > end || isNaN(start) || isNaN(end)) {
          return status['416'](res, next);
        }
        var fstream = fs.createReadStream(file, {start: start, end: end});
        fstream.on('error', function (err) {
          status['500'](res, next, { error: err });
        });
        res.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType || 'application/octet-stream'
        });
        fstream.pipe(res);
        return;
      }

      // TODO: Helper for this, with default headers.
      res.setHeader('etag', etag(stat));
      res.setHeader('last-modified', (new Date(stat.mtime)).toUTCString());
      res.setHeader('cache-control', cache);

      // Return a 304 if necessary
      if ( req.headers
        && (
          (req.headers['if-none-match'] === etag(stat))
          || (new Date(Date.parse(req.headers['if-modified-since'])) >= stat.mtime)
        )
      ) {
        return status[304](res, next);
      }

      if (!isHtml) res.setHeader('content-length', stat.size);
      res.setHeader('content-type', contentType || 'application/octet-stream');

      if (req.method === "HEAD") {
        res.statusCode = req.statusCode || 200; // overridden for 404's
        return res.end();
      }

      if (!isHtml)
      {
        var stream = fs.createReadStream(file);

        stream.pipe(res);
        stream.on('error', function (err) {
          status['500'](res, next, { error: err });
        });

        stream.on('end', function () {
          res.statusCode = 200;
          res.end();
        });
      }
      else
      {
        var contents = fs.readFileSync(file).toString('utf-8');
        for (var i=0;i<modifyFunctions.length;i++)
        {
          contents = modifyFunctions[i](contents);
        }

        var output = new Buffer(contents, 'utf-8');
        res.setHeader('content-length', Buffer.byteLength(contents, 'utf-8'));
        res.end(output);
      }
    }
  };
};

sexstatic.version = version;
sexstatic.showDir = showDir;

// Check to see if we should try to compress a file with gzip.
function shouldCompress(req) {
  var headers = req.headers;

  return headers && headers['accept-encoding'] &&
    headers['accept-encoding']
      .split(",")
      .some(function (el) {
        return ['*','compress', 'gzip', 'deflate'].indexOf(el) != -1;
      })
    ;
}

// this code is possibly lazy and broken so what i dont care props to @jesusabdulluh he did a good 60-70% of the work.
function decodePathname(pathname) {
  var pieces = pathname.split('/');

  return pieces.map(function (piece) {
    piece = decodeURIComponent(piece);

    if (process.platform === 'win32' && /\\/.test(piece)) {
      throw new Error('Invalid forward slash character');
    }

    return piece;
  }).join('/');
}

if (!module.parent) {
  var http = require('http'),
      opts = require('minimist')(process.argv.slice(2)),
      port = opts.port || opts.p || 8000,
      dir = opts.root || opts._[0] || process.cwd();

  opts.modifyFunctions = [
    function test(c) {
      console.log('hello contents');
      return c;
    }
  ];

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
}
