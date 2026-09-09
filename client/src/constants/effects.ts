/**
 * OpenVideo Built-in GLSL & Pixi Filter Effects Catalog
 * Reference: https://docs.openvideo.dev/core/03-creative/effects
 */

import { GL_EFFECT_OPTIONS } from '@openvideo/engine-pixi';
import { effect } from 'vue';

// export const OPENVIDEO_EFFECTS: Record<string, string> = {
//   // Color Effects
//   grayscale: 'grayscale',
//   sepia: 'sepia',
//   invert: 'invert',
//   duotone: 'duotone',
//   tritone: 'tritone',
//   hueshift: 'hueShift',
//   neonflash: 'neonFlash',

//   // Blur and Focus
//   curtainblur: 'curtainBlur',
//   focustransition: 'focusTransition',
//   scalemoveblur: 'scaleMoveBlur',
//   motionblur: 'motionBlur',

//   // Distortion and Warping
//   distort: 'distort',
//   distortgrid: 'distortGrid',
//   distortspin: 'distortSpin',
//   distortrip: 'distortRip',
//   wave: 'wave',
//   wavedistort: 'waveDistort',
//   sinewave: 'sinewave',
//   swirlmovement: 'swirlMovement',

//   // Glitch and Digital
//   glitch: 'glitch',
//   rgbglitch: 'rgbGlitch',
//   rgbshift: 'rgbShift',
//   pixelate: 'pixelate',
//   pixelerror: 'pixelError',
//   darkerror: 'darkError',

//   // Light and Atmosphere
//   vignette: 'vignette',
//   shine: 'shine',
//   laser: 'laser',
//   lightning: 'lightning',
//   lightningveins: 'lightningVeins',
//   sparks: 'sparks',
//   brightpulse: 'brightPulse',
//   flashloop: 'flashLoop',
//   blackflash: 'blackFlash',

//   // Stylized Looks
//   halftone: 'halftone',
//   filmstrippro: 'filmStripPro',
//   tvscanlines: 'tvScanlines',
//   retro70s: 'retro70s',
//   hologramscan: 'hologramScan',
//   graffiti: 'graffiti',
//   solution: 'solution',

//   // Transitions (Within Clips)
//   curtainopen: 'curtainOpen',
//   paperbreakreveal: 'paperBreakReveal',
//   warptransition: 'warpTransition',
//   pixelatetransition: 'pixelateTransition',
//   inverseaperture: 'inverseAperture',

//   // Camera Movement
//   cameramove: 'cameraMove',
//   fastzoom: 'fastZoom',
//   rotationmovement: 'rotationMovement',
//   perspectivesingle: 'perspectiveSingle',

//   // Special Overlays
//   bubblesparkles: 'bubbleSparkles',
//   butterflysparkles: 'butterflySparkles',
//   heartsparkles: 'heartSparkles',
//   chromatic: 'chromatic',

//   // Pixi Filter Effects
//   adjustmentfilter: 'adjustmentFilter',
//   hsladjustmentfilter: 'hslAdjustmentFilter',
//   colorreplacefilter: 'colorReplaceFilter',
//   coloroverlayfilter: 'colorOverlayFilter',
//   grayscalefilter: 'grayscaleFilter',
//   kawaseblurfilter: 'kawaseBlurFilter',
//   motionblurfilter: 'motionBlurFilter',
//   radialblurfilter: 'radialBlurFilter',
//   zoomblurfilter: 'zoomBlurFilter',
//   tiltshiftfilter: 'tiltShiftFilter',
//   backdropblurfilter: 'backdropBlurFilter',
//   bloomfilter: 'bloomFilter',
//   advancedbloomfilter: 'advancedBloomFilter',
//   godrayfilter: 'godrayFilter',
//   glowfilter: 'glowFilter',
//   outlinefilter: 'outlineFilter',
//   embossfilter: 'embossFilter',
//   bevelfilter: 'bevelFilter',
//   crosshatchfilter: 'crossHatchFilter',
//   bulgepinchfilter: 'bulgePinchFilter',
//   twistfilter: 'twistFilter',
//   shockwavefilter: 'shockwaveFilter',
//   reflectionfilter: 'reflectionFilter',
//   crtfilter: 'crtFilter',
//   oldfilmfilter: 'oldFilmFilter',
//   glitchfilter: 'glitchFilter',
//   rgbsplitfilter: 'rgbSplitFilter',
//   dotfilter: 'dotFilter',
//   asciifilter: 'asciiFilter',
//   dropshadowfilter: 'dropShadowFilter',
//   convolutionfilter: 'convolutionFilter',
//   simplexnoisefilter: 'simplexNoiseFilter',
//   simplelightmapfilter: 'simpleLightmapFilter',
//   colormapfilter: 'colorMapFilter',
//   colorgradientfilter: 'colorGradientFilter',
//   multicolorreplacefilter: 'multiColorReplaceFilter',
// };

/**
 * Normalizes user/AI effect string to official OpenVideo effectKey.
 * Returns null if no effect or invalid key.
 */
export function normalizeEffectKey(raw?: string): string | null {
  if (!raw) return null;
  let effect = GL_EFFECT_OPTIONS.find(effect => effect.key == raw);
  return effect?.key || null;
  // if(!effect){
  //   return null;
  // }
  // const clean = raw.toLowerCase().trim().replace(/[\s_-]+/g, '');
  // if (['', 'none', 'normal', 'noneeffect', 'default', 'raw'].includes(clean)) {
  //   return null;
  // }
  // return OPENVIDEO_EFFECTS[clean] || null;
}
