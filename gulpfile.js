var gulp = require('gulp'),
    eventStream = require('event-stream'),
    gulpLoadPlugins = require('gulp-load-plugins'),
    fs = require('fs'),
    del = require('del'),
    path = require('path'),
    size = require('gulp-size'),
    uri = require('urijs'),
    urljoin = require('url-join'),
    s = require('underscore.string'),
    stringifyObject = require('stringify-object'),
    argv = require('yargs').argv,
    hawtio = require('hawtio-node-backend');

var plugins = gulpLoadPlugins({});

var config = {
  main: '.',
  ts: ['plugins/**/*.ts'],
  less: './less/**/*.less',
  templates: ['plugins/**/*.html'],
  templateModule: 'hawtio-kubernetes-api-templates',
  dist: argv.out || './dist/',
  js: 'hawtio-kubernetes-api.js',
  dts: 'hawtio-online.d.ts',
  tsProject: plugins.typescript.createProject({
    target: 'ES5',
    outFile: 'compiled.js',
    declaration: true,
    noResolve: false,
    typeRoots: [
      "node_modules/@types",
      "node_modules/@hawtio"
    ]
  }),
};

var normalSizeOptions = {
    showFiles: true
}, gZippedSizeOptions  = {
    showFiles: true,
    gzip: true
};

gulp.task('clean-defs', function() {
  return del('defs.d.ts');
});

gulp.task('tsc', ['clean-defs'], function() {
  var cwd = process.cwd();
  var tsResult = gulp.src(config.ts)
    .pipe(plugins.sourcemaps.init())
    .pipe(config.tsProject())
    .on('error', plugins.notify.onError({
      onLast: true,
      message: '<%= error.message %>',
      title: 'Typescript compilation error'
    }));

    return eventStream.merge(
      tsResult.js
        .pipe(plugins.sourcemaps.write())
        .pipe(gulp.dest('.')),
      tsResult.dts
        .pipe(plugins.rename(config.dts))
        .pipe(gulp.dest(config.dist)));
});

gulp.task('template', ['tsc'], function() {
  return gulp.src(config.templates)
    .pipe(plugins.angularTemplatecache({
      filename: 'templates.js',
      root: 'plugins/',
      standalone: true,
      module: config.templateModule,
      templateFooter: '}]); hawtioPluginLoader.addModule("' + config.templateModule + '");'
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('concat', ['template'], function() {
  var gZipSize = size(gZippedSizeOptions);
  return gulp.src(['compiled.js', 'templates.js'])
    .pipe(plugins.concat(config.js))
    .pipe(size(normalSizeOptions))
    .pipe(gZipSize)
    .pipe(gulp.dest(config.dist));
});

gulp.task('clean', ['concat'], function() {
  return del(['templates.js', 'compiled.js']);
});

gulp.task('watch', ['build', 'build-example'], function() {
  plugins.watch(['node_modules/**/*.js', 'index.html', config.dist + '/' + config.js], ['reload']);
  plugins.watch(['node_modules/**/*.d.ts', config.ts, config.templates], ['tsc', 'template', 'concat', 'clean']);
});

gulp.task('connect', ['watch'], function() {
  // lets disable unauthorised TLS issues with kube REST API
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var kubeBase = process.env.KUBERNETES_MASTER || 'https://localhost:8443';
  var kube = uri(urljoin(kubeBase, 'api'));
  var oapi = uri(urljoin(kubeBase, 'oapi'));
  console.log("Connecting to Kubernetes on: " + kube);

  var staticAssets = [{
      path: '/',
      dir: '.'
  }];

  var dirs = fs.readdirSync('./libs');
  dirs.forEach(function(dir) {
    var dir = './libs/' + dir;
    console.log("dir: ", dir);
    if (fs.statSync(dir).isDirectory()) {
      console.log("Adding directory to search path: ", dir);
      staticAssets.push({
        path: '/',
        dir: dir
      });
    }
  });

  var localProxies = [];
  var defaultProxies = [{
    proto: kube.protocol(),
    port: kube.port(),
    hostname: kube.hostname(),
    path: '/kubernetes/api',
    targetPath: kube.path()
  }, {
    proto: oapi.protocol(),
    port: oapi.port(),
    hostname: oapi.hostname(),
    path: '/kubernetes/oapi',
    targetPath: oapi.path()
  }, {
    proto: kube.protocol(),
    hostname: kube.hostname(),
    port: kube.port(),
    path: '/jolokia',
    targetPath: '/hawtio/jolokia'
  }, {
    proto: kube.protocol(),
    hostname: kube.hostname(),
    port: kube.port(),
    path: '/git',
    targetPath: '/hawtio/git'
  }];

  var staticProxies = localProxies.concat(defaultProxies);

  hawtio.setConfig({
    port: process.env.DEV_PORT || 2772,
    staticProxies: staticProxies,
    staticAssets: staticAssets,
    fallback: 'index.html',
    liveReload: {
      enabled: true
    }
  });
  var debugLoggingOfProxy = process.env.DEBUG_PROXY === "true";
  var useAuthentication = process.env.DISABLE_OAUTH !== "true";

  var googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  var googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  hawtio.use('/osconsole/config.js', function(req, res, next) {
    var config = {
      api: {
        openshift: {
          proto: oapi.protocol(),
          hostPort: oapi.host(),
          prefix: oapi.path()
        },
        k8s: {
          proto: kube.protocol(),
          hostPort: kube.host(),
          prefix: kube.path()
        }
      }
    };
    if (googleClientId && googleClientSecret) {
      config.master_uri = kubeBase;
      config.google = {
         clientId: googleClientId,
         clientSecret: googleClientSecret,
         authenticationURI: "https://accounts.google.com/o/oauth2/auth",
         authorizationURI: "https://accounts.google.com/o/oauth2/auth",
         scope: "profile",
         redirectURI: "http://localhost:9000"
      };

    } else if (useAuthentication) {
      config.master_uri = kubeBase;
      config.openshift = {
        oauth_authorize_uri: urljoin(kubeBase, '/oauth/authorize'),
        oauth_client_id: 'fabric8'
      };
    }
    var answer = "window.OPENSHIFT_CONFIG = window.HAWTIO_OAUTH_CONFIG = " + stringifyObject(config);
    res.set('Content-Type', 'application/javascript');
    res.send(answer);
  });

  hawtio.use('/', function(req, res, next) {
          var path = req.originalUrl;
          // avoid returning these files, they should get pulled from js
          if (s.startsWith(path, '/plugins/') && s.endsWith(path, 'html')) {
            console.log("returning 404 for: ", path);
            res.statusCode = 404;
            res.end();
          } else {
            if (debugLoggingOfProxy) {
              console.log("allowing: ", path);
            }
            next();
          }
        });
  hawtio.listen(function(server) {
    var host = server.address().address;
    var port = server.address().port;
    console.log("started from gulp file at ", host, ":", port);
  });
});

gulp.task('reload', function() {
  gulp.src('.')
    .pipe(hawtio.reload());
});

gulp.task('build', ['tsc', 'template', 'concat', 'clean']);

gulp.task('default', ['connect']);
