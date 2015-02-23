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
var zip = require('gulp-zip');
var header = require('gulp-header');
var replace = require('gulp-replace');
var pkg = require('./bower.json');

gulp.task('all', function() {
    return bundle('all');
});

gulp.task('google', function() {
    return bundle('google');
});

gulp.task('mapbox', function() {
    return bundle('mapbox');
});

gulp.task('bing', function() {
    return bundle('bing');
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

gulp.task('serve', ['html', 'sass', 'js', 'watch', 'connect'], function() {

});

gulp.task('version', function() {
    return gulp.src(['index.html'])
        .pipe(replace(/-[^-]*\.zip/, '-' + pkg.version + '.zip'))
        .pipe(replace(/Download v[^<]*/, 'Download v' + pkg.version))
        .pipe(gulp.dest('.'));
});

gulp.task('default', ['all', 'google', 'mapbox', 'bing', 'version'], function() {
    return gulp.src('./dist/*.js')
        .pipe(zip('markersjs-' + pkg.version + '.zip'))
        .pipe(gulp.dest('dist'))
});

var bundle = function(name) {

    var banner = ['/**',
        ' * <%= pkg.name %> - <%= pkg.description %>',
        ' * @version v<%= pkg.version %>',
        ' * @link <%= pkg.homepage %>',
        ' * @license <%= pkg.license %>',
        ' */',
        ''].join('\n');


    var bundler = browserify({
        entries: ['./src/distributions/' + name + '.js'],
        debug: false
    });

    return bundler
        .bundle()
        .pipe(source('markers.' + name + '.js')) // gives streaming vinyl file object
        .pipe(buffer()) // <----- convert from streaming to buffered vinyl file object
        .pipe(header(banner, { pkg : pkg } ))
        .pipe(gulp.dest('./dist/'))
        .pipe(uglify({preserveComments: 'some'}))
        .pipe(rename({ extname: '.min.js' }))
        .pipe(gulp.dest('./dist/'))
        .pipe(connect.reload());
};