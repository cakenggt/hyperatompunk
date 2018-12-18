/**
 * We can set up a Three.js scene, use the XTerm screen as an image texture, and
 * add fragment shaders using the "postprocessing" npm package.
 *
 * XTerm inserts 4 canvases into the DOM:
 *   1) one to render any text output
 *   2) one to render the background for any selected text done with the mouse
 *   3) one to render any clickable links to webpages
 *   4) one to render the cursor
 *
 * So we must apply any shader effects to all of these layers.
 *
 * Downside: any terminal contents that are re-positioned by shaders will be out
 * of sync with xTerm's text selection.
 */

import {
	Scene, OrthographicCamera, WebGLRenderer, PlaneGeometry, Mesh, Vector2,
	MeshBasicMaterial, CanvasTexture, LinearFilter, Clock
} from 'three';
import { EffectComposer, RenderPass, Pass, EffectPass } from 'postprocessing';
import createPasses from './passes';

exports.decorateTerm = (Term, { React }) => {
	class HyperPostProcessing extends React.Component {
		constructor(...args) {
			super(...args);

			this._onDecorated = this._onDecorated.bind(this);
			this._onCanvasReplacement = this._onCanvasReplacement.bind(this);

			this._isInit = false; // have we already initialized?
			this._term = null; // IV for the argument passed in `onDecorated`
			this._xTermScreen = null; // xterm's container for render layers
			this._xTermLayerMap = new Map(); // map for each render layer and the material we will create
			this._container = null; // container for the canvas we will inject
			this._canvas = null; // the canvas we will inject
			this._clock = this._scene = this._renderer = this._camera = this._composer = null; // threejs + postprocessing stuff

			this.passes = []; // all of the passes for EffectComposer
			this._shaderPasses = []; // a subset of all passes that are not an EffectPass
		}

		_onDecorated(term) {
			if (this.props.onDecorated) {
				this.props.onDecorated(term);
			}

			if (!term || this._isInit) {
				return;
			}

			this._term = term;
			this._init();
		}

		_init() {
			console.log('start init')
			const passes = createPasses();
			console.log('made passes')
			if (!passes || passes.length === 0) {
				return;
			}
			console.log('checked length of passes')

			this._isInit = true;

			this._container = this._term.termRef;
			this._xTermScreen = this._container.querySelector('.xterm .xterm-screen');

			const renderLayers = this._xTermScreen.querySelectorAll('canvas');
			for (const canvas of renderLayers) {
				canvas.style.opacity = 0;
			}

			this._setupScene(renderLayers);
			this._clock = new Clock({ autoStart: false});

			// store all our passes
			try {
				this.passes = [new RenderPass(this._scene, this._camera), ...passes];
				this.passes[this.passes.length - 1].renderToScreen = true;
				this.passes.forEach(pass => this._composer.addPass(pass));
				this._shaderPasses = this.passes.slice(1).filter(pass => {
					return (pass instanceof Pass) && !(pass instanceof EffectPass);
				});
			} catch (e) {
				console.error(e);
			}

			console.log(3)
			// listen for any changes that happen inside XTerm's screen
			this._layerObserver = new MutationObserver(this._onCanvasReplacement);
			this._layerObserver.observe(this._xTermScreen, { childList: true });
			console.log(2)
			// set our canvas size and begin rendering
			// i don't think there's a need to remove this listener
			this._term.term.on('resize', () => {
				const {
					width, height
				} = this._term.term.element.getBoundingClientRect();

				this._composer.setSize(width, height);

				this._setUniforms({
					aspect: width / height,
					resolution: new Vector2(width, height)
				});
			});
			console.log(1)
			const that = this;
			this._term.term.on('resize', function resizeOnce() {
				that._term.term.off('resize', resizeOnce);
				that._clock.start();
				that._startAnimationLoop();
			});
			console.log('end of _init')
		}

		/**
		 * Boilerplate for threejs.
		 *
		 * @param {Iterable} renderLayers - The list of xTerm's render layers we
		 * will use to create textures out of.
		 */
		_setupScene(renderLayers) {
			const { width, height } = this._term.term.element.getBoundingClientRect();

			this._canvas = document.createElement('canvas');
			this._canvas.classList.add('hyper-postprocessing', 'canvas');

			// scene!
			this._scene = new Scene();

			// renderer!
			this._renderer = new WebGLRenderer({
				canvas: this._canvas,
				preserveDrawingBuffer: true,
				alpha: true
			});
			this._renderer.setPixelRatio(window.devicePixelRatio);
			this._renderer.setSize(width, height);

			// camera!
			const [w, h] = [width / 2, height / 2];
			this._camera = new OrthographicCamera(-w, w, h, -h, 1, 1000);
			this._camera.position.z = 1;

			// composer!
			this._composer = new EffectComposer(this._renderer);

			// xTerm textures!
			for (const canvas of renderLayers) {
				const texture = new CanvasTexture(canvas);
				texture.minFilter = LinearFilter;

				const geometry = new PlaneGeometry(width, height);
				const material = new MeshBasicMaterial({
					color: 0xFFFFFF,
					map: texture,
					transparent: true
				});
				const mesh = new Mesh(geometry, material);

				this._scene.add(mesh);
				this._xTermLayerMap.set(canvas, material);
			}

			// add the element to the page
			this._container.append(this._renderer.domElement);
		}

		/**
		 * On tab switch, cancel/start the rendering loop.
		 */
		componentWillReceiveProps(props) {
			if (!this._isInit) {
				return;
			}

			if (this.props.isTermActive && !props.isTermActive) {
				this._cancelAnimationLoop();
			} else if (!this.props.isTermActive && props.isTermActive) {
				this._startAnimationLoop();
			}
		}

		/**
		 * Sets the given uniforms on all instances of ShaderPasses. We don't need
		 * to set uniforms on any EffectPasses -- all of the uniforms used here are
		 * automatically updated by postprocessing.
		 *
		 * @param {Object} obj - A map with uniform strings as keys and their value
		 * as values.
		 */
		_setUniforms(obj) {
			for (const uniformKey of Object.keys(obj)) {
				const value = obj[uniformKey];

				for (const pass of this._shaderPasses) {
					const material = pass.getFullscreenMaterial();

					if (material.uniforms[uniformKey] !== undefined) {
						material.uniforms[uniformKey].value = value;
					}
				}
			}
		}

		/**
		 * Begins the rendering loop, as well as sets time uniforms on passes that
		 * contain them, and sets the `needsUpdate` flag on all of our xTerm
		 * materials.
		 */
		_startAnimationLoop() {
			const xTermMaterials = Array.from(this._xTermLayerMap.values());
			const timeUniforms = this._shaderPasses.filter(pass => {
				return pass.getFullscreenMaterial().uniforms.time !== undefined;
			}).map(pass => {
				return pass.getFullscreenMaterial().uniforms.time;
			});

			const xTermMaterialsLength = xTermMaterials.length;
			const timeUniformsLength = timeUniforms.length;

			const that = this;

			(function render() {
				that._animationId = window.requestAnimationFrame(render);

				for (let i = 0; i < timeUniformsLength; i++) {
					timeUniforms.value = that._clock.getElapsedTime();
				}

				for (let i = 0; i < xTermMaterialsLength; i++) {
					xTermMaterials[i].map.needsUpdate = true;
				}

				that._composer.render(that._clock.getDelta());
			})();
		}

		_cancelAnimationLoop() {
			window.cancelAnimationFrame(this._animationId);
		}

		render() {
			return React.createElement(Term, Object.assign({}, this.props, {
				onDecorated: this._onDecorated
			}));
		}

		/**
		 * XTerm sometimes removes and replaces render layer canvases. afaik there
		 * isn't an event that fires when this happens (i think it only happens
		 * when Terminal#setTransparency is called). this function is the callback
		 * for a MutationObserver that observes `.xterm-screen` whenever the
		 * childList changes.
		 */
		_onCanvasReplacement([e]) {
			const { removedNodes, addedNodes } = e;
			for (let i = 0; i < removedNodes.length; i++) {
				this._replaceTexture(removedNodes[i], addedNodes[i]);
			}
		}

		_replaceTexture(removedCanvas, addedCanvas) {
			const affectedMaterial = this._xTermLayerMap.get(removedCanvas);
			const newTexture = new CanvasTexture(addedCanvas);
			newTexture.minFilter = LinearFilter;

			affectedMaterial.map.dispose();
			affectedMaterial.map = newTexture;
		}

		componentWillUnmount() {
			if (this._isInit) {
				this.destroy();
			}
		}

		/**
		 * Garbage collection. Also, try many various things to dispose the scene.
		 * I don't know what the proper way is to do this.
		 */
		destroy() {
			this._cancelAnimationLoop();
			this._clock.stop();

			while (this._scene.children.length > 0) {
				const mesh = this._scene.children[0];
				this._scene.remove(mesh);

				mesh.material.map.dispose();
				mesh.material.dispose();
				mesh.geometry.dispose();
			}

			this._layerObserver.disconnect();
			this._canvas.remove();
			this._composer.dispose();

			this._renderer.dispose();
			this._renderer.forceContextLoss();
			this._renderer.context = null;
			this._renderer.domElement = null;

			this._isInit = false;
			this._term = this._container = this._xTermScreen = this._canvas = null;
			this._layerObserver = this._xTermLayerMap = null;
			this.passes = this._shaderPasses = null;
			this._clock = this._scene = this._renderer = this._camera = this._composer = null;
		}
	}

	return HyperPostProcessing;
};

// CSS to position the our canvas correctly
exports.decorateConfig = (config) => {
	return Object.assign({}, config, {
		css: `
		${config.css || ''}

		.term_term {
			position: relative;
		}

		.hyper-postprocessing.canvas {
			position: absolute;
			top: 0;
			left: 0;
		}
		`
	});
};
