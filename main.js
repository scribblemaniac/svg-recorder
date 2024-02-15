"use strict";

const body = document.body,
    form = document.querySelector('form'),
    svgLabel = form.svg.parentNode,
    previewer = svgLabel.querySelector('img');

let initTime, lastFrameNum;

form.svg.onchange = function(event) {
    const [file] = form.svg.files;
    previewer.src = URL.createObjectURL(file);
    svgLabel.className = 'choosen';
    // TODO: read the canvas sources
    // TODO: get the canvas width and height to set the attributes in the in the SVG node (see https://stackoverflow.com/a/28692538)
    // TODO: get the animation duration
}

previewer.onload = function() {
    form.width.placeholder = previewer.naturalWidth;
    form.height.placeholder = previewer.naturalHeight;
}

form.onsubmit = function (event) {
    // validate form
    const errors = validateForm();
    if (errors.length)
        console.error(errors);
    if (!errors.length) {
        /**
         * @type {File}
         */
        const file = form.svg.files[0];
        // start record
        startRecord({
            url: URL.createObjectURL(file),
            width: parseInt(form.width.value || form.width.placeholder),
            height: parseInt(form.height.value || form.height.placeholder),
            duration: parseInt(form.duration.value || form.duration.placeholder),
            framerate: parseInt(form.framerate.value || form.framerate.placeholder),
            background: form.background.value
        }).then(function(blobs) {
            // Create a new instance of JSZip
            const zip = new JSZip();

            let droppedFrames = 0;
            let lastFrame = null;

            // Iterate over the array of PNG blobs
            for (let i = 0; i < blobs.length; i++) {
                // Create a new file name for each PNG image
                const fileName = `${i}.png`;

                if (typeof(blobs[i]) !== 'undefined') {
                    // Add the PNG blob to the zip file
                    lastFrame = dataURItoBlob(blobs[i]);
                    zip.file(fileName, lastFrame);
                }
                else {
                    zip.file(fileName, lastFrame);
                    droppedFrames++;
                }

            }

            console.log("Dropped frames:", droppedFrames);

            // Generate the zip file asynchronously
            zip.generateAsync({ type: "blob" }).then(function (content) {
                // Save the zip file using saveMe
                saveAs(content, file.name.replace(/\.svgz?$/i, '.zip'));
            });
        });
    }

    // prevent form submit
    event.preventDefault();
    event.stopPropagation();
    return;
}

form.width.onchange = form.height.onchange = function(e) {
    const current = e.currentTarget;
    if (form["link-dimensions"].checked) {
        const other = current==form.width ? form.height : form.width;
        const ratio = parseInt(current.value) / parseInt(current.previousValue || current.placeholder);
        other.value = Math.round(parseInt(other.value || other.placeholder) * ratio);
    }
    storeValue(current);
}

form.width.onfocus = form.height.onfocus = function(e) {
    storeValue(e.currentTarget);
}

/**
 * @param {HTMLInputElement} input
 */
function storeValue(input) {
    input.previousValue = input.value;
}

/**
 * Validate the form
 * @returns Validation errors
 */
function validateForm() {
    const errors = [];
    // check file selected
    if (!form.svg.files.length)
        errors.push({
            field: 'svg',
            message: 'No file selected'
        });
    // check width and height
    if (form.width.value && !checkPositifInt(form.width.value))
        errors.push({
            field: 'width',
            message: 'The width is not a valid number'
        });
    if (form.height.value && !checkPositifInt(form.height.value))
        errors.push({
            field: 'height',
            message: 'The height is not a valid number'
        });
    // check duration
    if (form.duration.value && !checkPositifInt(form.duration.value))
        errors.push({
            field: 'duration',
            message: 'The duration is not a valid number'
        });
    // check framerate
    if (form.framerate.value && !checkPositifInt(form.framerate.value))
        errors.push({
            field: 'framerate',
            message: 'The framerate is not a valid number'
        });
    // check background
    if (!form.background.value)
        errors.push({
            field: 'background',
            message: 'The background color must be defined'
        });
    else if (!/^#[a-fA-F0-9]{6}$/.test(form.background.value))
        errors.push({
            field: 'background',
            message: `The background value is not a valid color: ${form.background.value}`
        });
    return errors;
}

/**
 * Check if the given string is a valid integer over zero
 * @param {string} val The string to check
 * @returns true if it's a valid number
 */
function checkPositifInt(val) {
    return /^[1-9]\d*$/.test(val);
}

function dataURItoBlob(dataURI) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    var byteString = atob(dataURI.split(',')[1]);

    // separate out the mime component
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

    // write the bytes of the string to an ArrayBuffer
    var ab = new ArrayBuffer(byteString.length);

    // create a view into the buffer
    var ia = new Uint8Array(ab);

    // set the bytes of the buffer to the correct values
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    var blob = new Blob([ab], {type: mimeString});
    return blob;

  }

/**
 * Start recording with the given options
 * @param {any} options Recording options
 * @returns {Promise<Blob>} The recoreded video blob
 */
function startRecord(options) {
    return new Promise(function(resolve, reject) {
        console.log('startRecord', options);
        if (body.className)
            return reject(new Error("It's already recording"));

        body.className = 'recording';
        // create image, canvas and recorder
        const image = document.createElement('img'),
            canvas = document.createElement('canvas'),
            ctx = canvas.getContext('2d'),
            frames = [];

        initTime = null;
        lastFrameNum = -1;

        canvas.width = image.width = options.width;
        canvas.height = image.height = options.height;
        ctx.fillStyle = options.background;

        body.appendChild(image);
        body.appendChild(canvas);

        // on image loaded start recording
        image.onload = function(event) {
            // Start capturing frames
            requestAnimationFrame(renderLoop);
        }
        image.src = options.url;

        /**
         * Loop rendering the canvas
         * @param {number} time The loop time
         */
        function renderLoop(time) {
            if (initTime == null) {
                // First call
                initTime = time;
            } else if (time - initTime >= options.duration) {
                // stop capturing frames after defined duration
                resolve(frames);
                return;
            }

            const currentFrameNum = Math.floor((time - initTime) / 1000 * options.framerate);
            if (currentFrameNum > lastFrameNum) {
                render();
                const frame = canvas.toDataURL("image/png");
                frames[currentFrameNum] = frame;
                lastFrameNum = currentFrameNum;
            }

            requestAnimationFrame(renderLoop);
        }

        /**
         * Render the canvas with the given background and SVG
         */
        function render() {
            ctx.rect(0, 0, options.width, options.height);
            ctx.fill();
            ctx.drawImage(image, 0, 0, options.width, options.height);
        }
    });
}
