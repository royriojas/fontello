'use strict';


/*global N*/


// stdlib
var fs    = require('fs');
var path  = require('path');


// 3rd-party
var views     = require('nlib').Views;
var async     = require('nlib').Vendor.Async;
var _         = require('nlib').Vendor.Underscore;
var apify     = require('nlib').Support.apify;


// internal
var findPaths = require('../../find_paths');


////////////////////////////////////////////////////////////////////////////////


function buildApiPath(pathname) {
  var api = apify(pathname.relativePath, '', pathname.extension);
  // return deduplicated api path
  return _.uniq(api.split('.')).join('.');
}


////////////////////////////////////////////////////////////////////////////////


// compileViews(root, callback(err)) -> Void
// - root (String): Pathname containing views directories.
// - callback (Function): Executed once everything is done.
//
// Compiles all views, inject them into `N.runtime.views` for the
// server and writes browserified versions into `views.js`.
//
module.exports = function compileViews(root, callback) {
  var
  bundleConfig  = require('../../../bundle.yml'),
  packageConfig = bundleConfig.packages.fontello,
  viewsConfig   = packageConfig.views,
  viewsRoot     = path.resolve(N.runtime.apps[0].root, viewsConfig.root),
  appRoot       = N.runtime.apps[0].root.replace(/\/*$/, '/'),
  findOptions   = _.pick(viewsConfig, 'include', 'exclude');

  findOptions.root = viewsRoot;

  // allow use includes relative to app root
  function filterPath(path) {
    return path.replace(/^@\/*/, appRoot);
  }

  findPaths(findOptions, function (err, pathnames) {
    var viewsTree = {};

    if (err) {
      callback(err);
      return;
    }

    async.forEachSeries(pathnames, function (pathname, nextPath) {
      pathname.read(function (err, str) {
        var compiled = viewsTree[buildApiPath(pathname)] = {};

        if (err) {
          nextPath(err);
          return;
        }

        async.parallel([
          function (next) {
            views.engines[pathname.extension].server(str, {
              filename:   pathname.absolutePath,
              filterPath: filterPath
            }, function (err, result) {
              compiled.server = result;
              next(err);
            });
          },
          function (next) {
            views.engines[pathname.extension].client(str, {
              filename:   pathname.absolutePath,
              filterPath: filterPath
            }, function (err, result) {
              compiled.client = result;
              next(err);
            });
          }
        ], nextPath);
      });
    }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      // set server-side views tree
      N.runtime.views = views.buildServerTree(viewsTree);

      // write client-side views tree
      views.writeClientTree(
        path.join(root, 'views.js'),
        viewsTree,
        'this.N.views',
        callback
      );
    });
  });
};
