'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var sass = require('gulp-sass');
var rename = require('gulp-rename');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var connect = require('gulp-connect');
var sourcemaps = require('gulp-sourcemaps');

gulp.task('all', function() {
    return bundle('all');
});

gulp.task('google', function() {
    return bundle('google');
});

gulp.task('mapbox', function() {
    return bundle('mapbox');
});

gulp.task('js', function() {
    var bundler = browserify({
        entries: ['./src/distributions/all.js'],
        debug: true
    });

    return bundler
        .bundle()
        .pipe(source('markers.all.js')) // gives streaming vinyl file object
        .pipe(buffer()) // <----- convert from streaming to buffered vinyl file object
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('./dist/'))
        .pipe(connect.reload());
});

gulp.task('sass', function () {
    gulp.src('assets/**/*.scss')
        .pipe(sass())
        .pipe(gulp.dest('assets'))
        .pipe(connect.reload());
});

gulp.task('html', function () {
    gulp.src('./index.html')
        .pipe(connect.reload());
});

gulp.task('watch', function() {
    gulp.watch('./assets/**/*.scss', ['sass']);
    gulp.watch('./src/**/*.js', ['js']);
    gulp.watch('./index.html', ['html']);
});

gulp.task('connect', function() {
    connect.server({
        livereload: true
    });
});

gulp.task('dev', ['html', 'sass', 'js', 'watch', 'connect'], function() {

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
        .pipe(gulp.dest('./dist/'))
        .pipe(connect.reload());
};