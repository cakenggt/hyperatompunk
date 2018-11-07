import { Uniform } from 'three';
import { EffectPass, Effect } from 'postprocessing';
import { BlendFunction } from 'postprocessing/src/effects/blending/BlendFunction.js'

export default () => {
  try {
    const crtFragmentShader = `
    uniform float separation;

    float random(in float diff)
    {
      return fract(sin(diff)*100000.0);
    }

    vec4 screenDoor(vec4 fragColor, vec2 uv)
    {
      float width = 3.0;
      float height = 3.0;
      float brightness = 0.5;
      vec2 bvector = vec2(brightness);

      float x = mod((uv.x * resolution.x), width) / 3.0;
      float y = mod((uv.y * resolution.y), (height+1.0));
      // r g and b channels in each pixel
      if (x < 0.33) {
          fragColor.gb *= bvector;
      }
      else if (x < 0.66) {
          fragColor.rb *= bvector;
      }
      else {
          fragColor.rg *= bvector;
      }

      if (y <= 1.0) {
          fragColor.rgb *= vec3(0);
      }

      return fragColor;
    }

    vec4 separate(vec4 fragColor, vec2 uv)
    {
      // Separate colors
      int separationPixels = 2;
      float separationPercentage = float(separationPixels) / resolution.x;
      float separationValue = separation*separationPercentage;
      vec4 blueColor = texture2D(inputBuffer, uv - vec2(separationValue, 0)) * vec4(0, 0.5, 1, 1);
      vec4 redColor = texture2D(inputBuffer, uv + vec2(separationValue, 0)) * vec4(1, 0.5, 0, 1);
      fragColor = blueColor + redColor;

      return fragColor;
    }

    vec4 flicker(in vec4 fragColor)
    {
      //flicker
      float magnitude = 0.1;
      fragColor.rgb *= vec3(1.0 - (random(time) * magnitude));

      return fragColor;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)
    {
      outputColor = texture2D(inputBuffer, uv);

      outputColor = separate(outputColor, uv);

      outputColor = flicker(outputColor);

      outputColor = screenDoor(outputColor, uv);
    }
    `;

    const crtEffect = new Effect('crtEffect', crtFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([['separation', new Uniform(0.5)]])
    });

    class CustomEffectPass extends EffectPass {
      render(renderer, readBuffer, writeBuffer, timeDelta) {
        // set any custom uniforms here -- important to go before the `super` call
        const prevSeparation = crtEffect.uniforms.get('separation').value;
        crtEffect.uniforms.get('separation').value = Math.min(
          1.0,
          Math.max(
            0.0,
            prevSeparation + (Math.random() - 0.5)/5
          )
        );

        super.render(...arguments);
      }
    }

    const curvedFragmentShader = `
    float easeInQuart(float time, float begin, float change, float duration) {
      return change * (time /= duration) * time * time * time + begin;
    }
    vec2 curvedMonitor(vec2 inputUV) {
      vec2 screenCenter = vec2(0.5);
      float radius = 0.5;
      float magnitude = 0.05; // how far the center of the "monitor" points out
      float cutShort = 0.3; // how far along the the easing curve we travel...I think...
      vec2 coords = vec2(inputUV.x - screenCenter.x, inputUV.y - screenCenter.y);
      float distFromOrigin = distance(inputUV, screenCenter);
      float scalar = easeInQuart(distFromOrigin, 1.0 / cutShort - magnitude, magnitude, radius);
      coords *= scalar * cutShort;
      return vec2(coords.x + screenCenter.x, coords.y + screenCenter.y);
    }
    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
      vec2 pos = curvedMonitor(uv);
      // avoids awkward texture sampling when pixel is not constrained to (0, 1)
      if (pos.x < 0.0 || pos.y < 0.0 || pos.x > 1.0 || pos.y > 1.0) {
        discard;
      }
      outputColor = texture2D(inputBuffer, pos);
    }
    `;

    return [
      new CustomEffectPass(null, crtEffect),
      new EffectPass(null, new Effect('curvedFragmentEffect', curvedFragmentShader, {
        blendFunction: BlendFunction.NORMAL,
      })),
    ];
  } catch (e) {
    console.error(e);
  }
}
