function GoogleCustomMarker(element) {
    this.ele_ = document.createElement('div');
    this.ele_.style.cssText = 'position: absolute; display: none';
    this.ele_.appendChild(element);
    this.hookedUp = false;
    var self = this;
    google.maps.event.addListener(this, 'position_changed', function() {
        self.draw();
    });
}

GoogleCustomMarker.prototype = new google.maps.OverlayView();

GoogleCustomMarker.prototype.onRemove= function() {
    if (this.ele_.parentNode) {
        this.ele_.parentNode.removeChild(this.ele_);
        this.hookedUp = false;
    }
};

GoogleCustomMarker.prototype.draw = function() {
    var projection = this.getProjection();
    if (projection) {
        var position = projection.fromLatLngToDivPixel(this.get('position'));

        var ele = this.ele_;
        ele.style.left = position.x + 'px';
        ele.style.top = position.y + 'px';
        ele.style.display = 'block';

        if (!this.hookedUp) {
            this.hookedUp = true;
            // Then add the overlay to the DOM
            var panes = this.getPanes();
            panes.overlayImage.appendChild(ele);
        }
    }
};

GoogleCustomMarker.prototype.getPosition = function() {
    return this.get('position');
};

GoogleCustomMarker.prototype.setPosition = function(pos) {
    return this.set('position', pos);
};
