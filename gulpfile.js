'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');

gulp.task('all', function() {
    return bundle('all');
});

gulp.task('google', function() {
    return bundle('google');
});

gulp.task('mapbox', function() {
    return bundle('mapbox');
});

gulp.task('default', ['all', 'google', 'mapbox'], function() {

});

var bundle = function(name) {

    var bundler = browserify({
        entries: ['./src/distributions/' + name + '.js'],
        debug: false
    });

    return bundler
        .bundle()
        .pipe(source('markers.' + name + '.js')) // gives streaming vinyl file object
        .pipe(buffer()) // <----- convert from streaming to buffered vinyl file object
        .pipe(gulp.dest('./dist/'))
        .pipe(uglify())
        .pipe(rename({ extname: '.min.js' }))
        .pipe(gulp.dest('./dist/'));
};