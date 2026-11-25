# 車シミュレーター

Single-player 3D free driving using the repository’s bundled Three.js. No API keys, external models or build required.

W / ArrowUp / Space: accelerate. S / ArrowDown: brake then reverse. A/D or arrows: steer. Shift: handbrake. C: chase/cockpit/overhead camera. R: recover to a road checkpoint. P/Escape: pause. Touch controls support simultaneous steering and pedal input.

Drive through ten gates, then continue freely. Buildings and the city boundary block the car. Blur, backgrounding, and pause clear held inputs. Audio is opt-in. Distance and gate progress last for the current page session.

Run `node --test virtual/car/physics.test.mjs` for motion, braking, collision and checkpoint checks.
