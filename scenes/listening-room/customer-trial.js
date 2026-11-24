/* Imported shop guests share the original one-at-a-time route and prop choreography. */
(function () {
    'use strict';
    const query = new URLSearchParams(location.search);
    if (query.get('customers') === 'original') return;
    const settings = window.ShopCustomerCatalog;
    const rosterMode = !settings[query.get('candidate')];
    let queue = [], firstRound = true, id = rosterMode ? 'a05' : query.get('candidate'), config = settings[id];
    function nextGuest() {
        if (!queue.length) {
            queue = Object.keys(settings).filter(key => !firstRound || key !== id);
            firstRound = false;
            for (let i = queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [queue[i], queue[j]] = [queue[j], queue[i]];
            }
        }
        if (queue.length > 1 && queue[0] === id) [queue[0], queue[1]] = [queue[1], queue[0]];
        return queue.shift();
    }
    const original = window.createShopCustomers;
    const trial = window.CustomerTrial = { id, name: config.name, rosterMode, ready: false, error: '', rig: null, asset: null, report: {}, stock: [] };
    window.createShopCustomers = function (ctx) {
        const T = ctx.T, api = original(Object.assign({},ctx,{activeCustomerIndices:[0]})), actor = api.rigs[0];
        trial.rig = actor;
        let avatar = null, mixer = null, activeAction = null, currentClip = '', armChains = [], head = null, spine = null, grips = [];
        const ikWeights = [0, 0]; let lean = 0, walkLegs = [], animatedPose = [], anatomyMeasured = false;
        let initialized = false, ticks = 0, maxErrors = [0, 0];
        const hands = [new T.Vector3(), new T.Vector3()];
        const referenceHands = [new T.Vector3(), new T.Vector3()], smoothRecordHand = new T.Vector3();
        let haveRecordTarget = false, pickedRecord = null, lastSearchArm = 1;
        // Leave the reference rig's transforms and prop choreography alive, but
        // render the imported weighted model in its place.
        actor.root.traverse(object => {
            if (!object.isMesh) return;
            let parent = object;
            while (parent && parent !== actor.album) parent = parent.parent;
            if (parent !== actor.album) object.visible = false;
        });
        actor.bag.visible = false;
        const oldInitialize = api.initialize.bind(api), oldUpdate = api.update.bind(api);
        api.initialize = function () {
            if (initialized) return;
            oldInitialize(); initialized = true;
            actor.state = 'outside'; actor.action = 'outside'; actor.elapsed = 0; actor.dwell = 1e9;
            actor.slot = null; actor.root.visible = false; actor.position = ctx.checkoutStation.outside.slice();
        };
        function findBone(bones, pattern) {
            return bones.find(b => pattern.test(b.name.replace(/[ _-]/g, '')));
        }
        function autoArms(bones) {
            // WebView 61 on the TG-Z02 predates Array.prototype.flatMap.
            return [].concat(...['L', 'R'].map(side => {
                const suffix = side === 'L' ? '(?:\\.L|Left|L)$' : '(?:\\.R|Right|R)$';
                const prefix = side === 'L' ? '^Left' : '^Right';
                const upper = findBone(bones, new RegExp('(?:upperarm|armupper)' + suffix, 'i')) || findBone(bones, new RegExp(prefix + '(?:Arm|UpperArm)$', 'i'));
                const lower = findBone(bones, new RegExp('(?:lowerarm|forearm|armlower)' + suffix, 'i')) || findBone(bones, new RegExp(prefix + '(?:ForeArm|LowerArm)$', 'i'));
                const hand = findBone(bones, new RegExp('(?:hand|wrist|fist)' + suffix, 'i')) || findBone(bones, new RegExp(prefix + '(?:Hand|Wrist)$', 'i'));
                return [upper, lower, hand];
            }));
        }
        const actions = {};
        const loader = new T.GLTFLoader();
        let completedVisits = 0;
        function loadGuest(nextId) {
            trial.ready = false; trial.error = ''; trial.report = {}; trial.asset = null;
            actor.dwell = 1e9; actor.elapsed = 0; actor.root.visible = false;
            actor.shadow.visible = false; actor.phone.visible = false;
            actor.paid = false; actor.carrying = false; actor.recordOnCounter = false;
            if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(avatar.children[0]); }
            if (avatar) {
                actor.root.remove(avatar);
                const geometries = new Set(), materials = new Set(), textures = new Set();
                avatar.traverse(mesh => {
                    if (!mesh.isMesh) return;
                    geometries.add(mesh.geometry);
                    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
                    if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
                });
                materials.forEach(material => { Object.values(material).forEach(value => { if (value && value.isTexture) textures.add(value); }); material.dispose(); });
                geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose());
            }
            avatar = null; mixer = null; activeAction = null; currentClip = '';
            armChains = []; grips = []; walkLegs = []; animatedPose = []; head = null; spine = null;
            anatomyMeasured = false; lean = 0; haveRecordTarget = false; pickedRecord = null;
            ikWeights.fill(0); maxErrors.fill(0); Object.keys(actions).forEach(key => delete actions[key]);
            id = nextId; config = settings[id]; trial.id = id; trial.name = config.name;
            actor.root.name = config.name;
            const url = window.SHOP_CUSTOMER_MODELS && window.SHOP_CUSTOMER_MODELS[id] ||
                (config.model || 'assets/candidates/' + id + '/main.glb') + '?v=' + (query.get('v') || Date.now());
            loader.load(url, gltf => {
            try {
                avatar = new T.Group(); avatar.name = config.name;
                const model = gltf.scene; avatar.add(model); actor.root.add(avatar);
                model.rotation.y += config.yaw;
                model.updateMatrixWorld(true);
                // Measure in an independent identity frame, before actor placement.
                const actorPosition = actor.root.position.clone(), actorRotation = actor.root.quaternion.clone();
                actor.root.position.set(0, 0, 0); actor.root.quaternion.identity(); actor.root.updateMatrixWorld(true);
                mixer = new T.AnimationMixer(model);
                const idle = gltf.animations.find(c => /^idle$/i.test(c.name)) || gltf.animations.find(c => /idle/i.test(c.name));
                const initial = idle && mixer.clipAction(idle);
                if (initial) { initial.play(); mixer.update(.001); }
                model.updateWorldMatrix(true, true);
                const bounds = new T.Box3(), point = new T.Vector3();
                model.traverse(object => {
                    if (!object.isMesh) return;
                    if (object.isSkinnedMesh) object.skeleton.update();
                    const positions = object.geometry.attributes.position;
                    for (let i = 0; i < positions.count; i++) {
                        point.fromBufferAttribute(positions, i);
                        if (object.isSkinnedMesh) object.boneTransform(i, point);
                        point.applyMatrix4(object.matrixWorld); bounds.expandByPoint(point);
                    }
                });
                const size = bounds.getSize(new T.Vector3());
                let shoulderY = 0, shoulderCount = 0;
                model.traverse(object => { if (object.isBone && /^upperarm[. _]?[lr]$/i.test(object.name)) { shoulderY += object.getWorldPosition(new T.Vector3()).y; shoulderCount++; } });
                const factor = config.shoulderHeight && shoulderCount ? config.shoulderHeight / Math.max(.001, shoulderY / shoulderCount - bounds.min.y) : config.height / Math.max(.001, size.y);
                model.scale.multiplyScalar(factor);
                model.position.y -= bounds.min.y / .80 * factor;
                actor.root.position.copy(actorPosition); actor.root.quaternion.copy(actorRotation);
                actor.root.updateMatrixWorld(true);
                const bones = [], meshes = [];
                model.traverse(object => {
                    if (object.isBone) bones.push(object);
                    if (!object.isMesh) return;
                    meshes.push(object); object.castShadow = false; object.receiveShadow = false;
                    object.frustumCulled = false;
                    const convert = material => material.isMeshBasicMaterial ? new T.MeshLambertMaterial({color:material.color,map:material.map,side:material.side,transparent:material.transparent,opacity:material.opacity,alphaTest:material.alphaTest,vertexColors:material.vertexColors}) : material;
                    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach(material => {
                        if (material.roughness !== undefined) material.roughness = Math.max(.88, material.roughness);
                        if (material.metalness !== undefined) material.metalness = Math.min(.12, material.metalness);
                    });
                });
                const canonical = name => name.replace(/[\s_.:\-]/g, '').toLowerCase();
                const names = config.arm ? config.arm.map(name => bones.find(b => canonical(b.name) === canonical(name))) : autoArms(bones);
                armChains = [names.slice(0, 3), names.slice(3, 6)];
                actor.root.updateMatrixWorld(true);
                // Providers disagree on whether Left means anatomical left or
                // the viewer's left. Match the shop's actual shoulder side.
                armChains.sort((a, b) => {
                    if (!a[0] || !b[0]) return 0;
                    const aa = actor.root.worldToLocal(a[0].getWorldPosition(new T.Vector3()));
                    const bb = actor.root.worldToLocal(b[0].getWorldPosition(new T.Vector3()));
                    return aa.x - bb.x;
                });
                head = bones.find(b => /^head$/i.test(b.name));
                spine = bones.find(b => /^(?:spine|abdomen)$/i.test(b.name)) || bones.find(b => /^chest$/i.test(b.name));
                grips = armChains.map((chain, index) => makeGrip(chain, index, meshes));
                if (config.family === 'a05') {
                    walkLegs = ['Left', 'Right'].map(side => {
                        const chain = ['UpLeg', 'Leg', 'Foot'].map(part => bones.find(b => b.name === side + part));
                        if (chain.some(bone => !bone)) return null;
                        const foot = actor.root.worldToLocal(chain[2].getWorldPosition(new T.Vector3()));
                        const hip = actor.root.worldToLocal(chain[0].getWorldPosition(new T.Vector3()));
                        const rotation = actor.root.getWorldQuaternion(new T.Quaternion()).invert().multiply(chain[2].getWorldQuaternion(new T.Quaternion()));
                        return { chain, x: foot.x, ankleHeight: foot.y * .80, z: hip.z, idleZ:foot.z, rotation };
                    }).filter(Boolean);
                }
                if (initial) initial.stop();
                mixer.uncacheRoot(model);
                gltf.animations.forEach(clip => {
                    // Keep pose animation in place; the existing collision-aware
                    // shop route owns all world locomotion.
                    const copy = clip.clone();
                    actions[clip.name] = mixer.clipAction(copy);
                });
                animatedPose = bones.map(bone => [bone, bone.quaternion.clone(), bone.scale.clone()]);
                const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3, 0);
                trial.asset = { bones: bones.map(b => b.name), clips: gltf.animations.map(c => c.name), triangles,
                    height: config.height, width: size.x / size.y * config.height, arms: armChains.map(chain => chain.map(b => b && b.name)),
                    hasWalk: gltf.animations.some(c => /walk/i.test(c.name)), adaptedWalk: config.family === 'a05' };
                trial.ready = true;
                actor.state = 'outside'; actor.action = 'outside'; actor.elapsed = 0; actor.dwell = completedVisits ? 9 : 0;
                actor.slot = null; actor.path = null; actor.root.visible = false; actor.position = ctx.checkoutStation.outside.slice();
                trial.error = '';
            } catch (error) { trial.error = error.message; console.error('Customer fitting:', error); }
        }, undefined, error => { trial.error = error.message || String(error); console.error('Customer model failed', error); });
        }
        loadGuest(id);


        function clipFor(walking) {
            const names = Object.keys(actions);
            if (config.family === 'a05') return names.find(name => /^idle$/i.test(name)) || names[0];
            if (walking > .08 && config.walkClip && actions[config.walkClip]) return config.walkClip;
            if (walking > .08) return names.find(name => /^walk$/i.test(name)) || names.find(name => /walk/i.test(name)) || names.find(name => /^run$/i.test(name)) || names.find(name => /run/i.test(name));
            return names.find(name => /^idle$/i.test(name)) || names.find(name => /idle|standing|rest/i.test(name)) || names[0];
        }
        function rotateBone(bone, from, to) {
            if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
            const turn = new T.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
            const world = turn.multiply(bone.getWorldQuaternion(new T.Quaternion()));
            bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(world);
            bone.updateWorldMatrix(false, true);
        }
        function frameQuaternion(finger, normal) {
            const z = finger.clone().normalize(), y = normal.clone().addScaledVector(z, -normal.dot(z)).normalize();
            if (y.lengthSq() < .001) y.set(0, 0, 1).addScaledVector(z, -z.z).normalize();
            const x = new T.Vector3().crossVectors(y, z).normalize(); y.crossVectors(z, x).normalize();
            return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
        }
        function makeGrip(chain, index, meshes) {
            if (chain.some(bone => !bone)) return null;
            const bone = config.family === 'a11' ? chain[1] : chain[2], handBones = new Set();
            bone.traverse(child => { if (child.isBone && (child !== bone || config.family !== 'a11')) handBones.add(child); });
            const centre = new T.Vector3(), point = new T.Vector3(); let total = 0;
            meshes.forEach(mesh => {
                if (!mesh.isSkinnedMesh) return;
                mesh.skeleton.update();
                const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight, positions = mesh.geometry.attributes.position;
                if (!indices || !weights) return;
                for (let i = 0; i < positions.count; i++) {
                    let influence = 0;
                    for (let c = 0; c < 4; c++) if (handBones.has(mesh.skeleton.bones[indices.array[i * 4 + c]])) influence += weights.array[i * 4 + c];
                    if (influence < .35) continue;
                    point.fromBufferAttribute(positions, i); mesh.boneTransform(i, point); point.applyMatrix4(mesh.matrixWorld);
                    centre.addScaledVector(point, influence); total += influence;
                }
            });
            if (total) centre.multiplyScalar(1 / total); else chain[2].getWorldPosition(centre);
            const wristPosition = chain[2].getWorldPosition(new T.Vector3());
            let finger = centre.clone().sub(wristPosition);
            if (finger.length() < .008) {
                const child = chain[2].children.find(c => c.isBone);
                finger = child ? child.getWorldPosition(new T.Vector3()).sub(wristPosition) : new T.Vector3(0, -1, 0);
            }
            finger.normalize();
            const normal = new T.Vector3(index ? -1 : 1, 0, 0).transformDirection(actor.root.matrixWorld);
            const basis = bone.getWorldQuaternion(new T.Quaternion()).invert().multiply(frameQuaternion(finger, normal));
            const marker = new T.Object3D(); marker.name = 'Calibrated palm grip'; marker.position.copy(bone.worldToLocal(centre.clone())); bone.add(marker);
            const childPose = [];
            bone.traverse(child => { if (child.isBone && child !== bone) childPose.push([child, child.quaternion.clone()]); });
            return { bone, marker, basis, childPose, independentWrist: config.family !== 'a11' };
        }
        function solveArm(chain, target, side, virtualEnd, bendDirection) {
            if (chain.some(bone => !bone)) return null;
            const [upper, lower, wrist] = chain;
            const shoulder = upper.getWorldPosition(new T.Vector3()), elbow = lower.getWorldPosition(new T.Vector3()), hand = (virtualEnd || wrist).getWorldPosition(new T.Vector3());
            const lengthA = shoulder.distanceTo(elbow), lengthB = elbow.distanceTo(hand);
            const delta = target.clone().sub(shoulder), requested = delta.length();
            const distance = Math.max(Math.abs(lengthA - lengthB) + .001, Math.min(requested, lengthA + lengthB - .003));
            if (lengthA < .001 || lengthB < .001 || requested < .001) return null;
            delta.normalize();
            const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
            const height = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
            const bend = (bendDirection || new T.Vector3(side * .7, -.9, .15)).clone().transformDirection(actor.root.matrixWorld);
            bend.addScaledVector(delta, -bend.dot(delta));
            if (bend.lengthSq() < .001) bend.set(0, 0, 1);
            bend.normalize();
            const goalElbow = shoulder.clone().addScaledVector(delta, along).addScaledVector(bend, height);
            const goalHand = shoulder.clone().addScaledVector(delta, distance);
            rotateBone(upper, elbow.clone().sub(shoulder), goalElbow.clone().sub(shoulder));
            const newElbow = lower.getWorldPosition(new T.Vector3()), newHand = (virtualEnd || wrist).getWorldPosition(new T.Vector3());
            rotateBone(lower, newHand.sub(newElbow), goalHand.sub(newElbow));
            return (virtualEnd || wrist).getWorldPosition(new T.Vector3()).distanceTo(target);
        }
        function gripArm(index, target, finger, normal, weight) {
            const chain = armChains[index], grip = grips[index];
            if (!grip || weight < .001) return null;
            const saved = chain.map(bone => bone.quaternion.clone());
            grip.childPose.forEach(([bone, quaternion]) => bone.quaternion.copy(quaternion));
            const desired = frameQuaternion(finger, normal).multiply(grip.basis.clone().invert());
            if (grip.independentWrist) {
                const offset = grip.marker.position.clone().multiply(grip.bone.getWorldScale(new T.Vector3())).applyQuaternion(desired);
                solveArm(chain, target.clone().sub(offset), index ? 1 : -1);
                grip.bone.quaternion.copy(grip.bone.parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(desired);
            } else {
                solveArm(chain, target, index ? 1 : -1, grip.marker);
                const start = chain[1].getWorldPosition(new T.Vector3()), end = grip.marker.getWorldPosition(new T.Vector3()), axis = end.sub(start).normalize();
                const from = new T.Vector3(0, 1, 0).applyQuaternion(grip.basis).applyQuaternion(grip.bone.getWorldQuaternion(new T.Quaternion()));
                from.addScaledVector(axis, -from.dot(axis)).normalize();
                const to = normal.clone().addScaledVector(axis, -normal.dot(axis)).normalize();
                const angle = Math.atan2(axis.dot(new T.Vector3().crossVectors(from, to)), T.MathUtils.clamp(from.dot(to), -1, 1));
                const world = new T.Quaternion().setFromAxisAngle(axis, angle).multiply(grip.bone.getWorldQuaternion(new T.Quaternion()));
                grip.bone.quaternion.copy(grip.bone.parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(world);
            }
            chain.forEach((bone, i) => bone.quaternion.slerpQuaternions(saved[i], bone.quaternion.clone(), weight));
            avatar.updateWorldMatrix(true, true);
            return grip.marker.getWorldPosition(new T.Vector3()).distanceTo(target);
        }
        function reachCost(index,target){
            const chain=armChains[index],grip=grips[index];if(!grip)return Infinity;
            const shoulder=chain[0].getWorldPosition(new T.Vector3()),elbow=chain[1].getWorldPosition(new T.Vector3());
            const hand=(grip.independentWrist?chain[2]:grip.marker).getWorldPosition(new T.Vector3());
            let goal=target.clone();
            if(grip.independentWrist){
                const finger=new T.Vector3(0,0,1).transformDirection(actor.root.matrixWorld),normal=new T.Vector3(0,-1,0).transformDirection(actor.root.matrixWorld);
                const rotation=frameQuaternion(finger,normal).multiply(grip.basis.clone().invert());
                goal.sub(grip.marker.position.clone().multiply(grip.bone.getWorldScale(new T.Vector3())).applyQuaternion(rotation));
            }
            return shoulder.distanceTo(goal)/Math.max(.01,shoulder.distanceTo(elbow)+elbow.distanceTo(hand));
        }
        api.update = function (time, dt) {
            // A slow asset load must never let the hidden reference customer enter.
            if (!trial.ready) { actor.state = 'outside'; actor.elapsed = 0; actor.dwell = 1e9; }
            const door = oldUpdate(time, dt);
            if (!trial.ready) return false;
            if (rosterMode && actor.state === 'outside' && actor.visits > completedVisits) {
                completedVisits = actor.visits;
                trial.stock.forEach(record => { record.visible = true; record.rotation.x = record.userData.browseHome; });
                loadGuest(nextGuest());
                return false;
            }
            actor.root.updateWorldMatrix(true, true);
            actor.forearms.forEach((forearm, i) => hands[i].copy(forearm.localToWorld(new T.Vector3(0, -.32, .012))));
            referenceHands.forEach((point,i)=>point.copy(hands[i]));
            // AnimationMixer skips writes for unchanged track values. Restore
            // last frame's unmodified animation pose before adding IK/lean;
            // otherwise constant idle bones accumulate a new bend every frame.
            animatedPose.forEach(([bone, quaternion, scale]) => { bone.quaternion.copy(quaternion); bone.scale.copy(scale); });
            const desired = clipFor(actor.walkBlend), action = actions[desired];
            if (action && currentClip !== desired) {
                action.reset().play(); if (activeAction) activeAction.crossFadeTo(action, .28, false);
                activeAction = action; currentClip = desired;
            }
            if (action) action.timeScale = /run/i.test(desired) ? Math.max(.25, actor.walkBlend * .5) : Math.max(.6, actor.walkBlend || 1);
            mixer.update(dt);
            animatedPose.forEach(([bone, quaternion, scale]) => { quaternion.copy(bone.quaternion); scale.copy(bone.scale); });
            if (head && config.headScale) head.scale.multiplyScalar(config.headScale);
            avatar.updateWorldMatrix(true, true);
            if (trial.sourcePose) {
                trial.report = {state:actor.state,action:actor.action,visits:actor.visits,paid:actor.paid,visible:actor.root.visible,position:actor.position.slice(),stageSeconds:actor.elapsed,clip:currentClip};
                return door;
            }
            if (config.family === 'a05' && actor.walkBlend > .001) {
                walkLegs.forEach((leg, i) => {
                    const phase = ((actor.step / (Math.PI * 2) + i * .5) % 1 + 1) % 1;
                    let z, lift = 0;
                    if (phase < .60) z = .185 - phase / .60 * .37;
                    else { const u = (phase - .60) / .40; z = -.185 + u * u * (3 - 2 * u) * .37; lift = Math.sin(Math.PI * u) * .04; }
                    const local = new T.Vector3(leg.x, leg.ankleHeight / .80, T.MathUtils.lerp(leg.idleZ,leg.z,actor.walkBlend) + z / .80 * actor.walkBlend);
                    const target = actor.root.localToWorld(local); target.y = .08 + leg.ankleHeight + lift * actor.walkBlend;
                    solveArm(leg.chain, target, i ? 1 : -1, null, new T.Vector3(0, 0, 1));
                    const world = actor.root.getWorldQuaternion(new T.Quaternion()).multiply(leg.rotation);
                    leg.chain[2].quaternion.copy(leg.chain[2].parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(world);
                });
            }
            const errors = [null, null];
            if(actor.state==='outside'){pickedRecord=null;trial.stock.forEach(record=>{record.visible=true;});}
            const interaction = !actor.state.startsWith('walk-') && !actor.state.startsWith('want-') && actor.state !== 'outside';
            const phoneStates = ['reach-phone', 'scan-code', 'confirm-payment', 'put-phone-away'];
            const usingPhone = phoneStates.includes(actor.state);
            const browsing = actor.state === 'browsing', picking = actor.state === 'picking';
            const desiredLean = browsing ? .10 : picking ? .10*Math.max(0,1-actor.elapsed/1.5) : 0;
            lean = desiredLean ? lean+(desiredLean-lean)*Math.min(1,dt*7) : 0;
            if (spine && lean) {
                const axis = new T.Vector3(1, 0, 0).transformDirection(actor.root.matrixWorld);
                const world = new T.Quaternion().setFromAxisAngle(axis, lean).multiply(spine.getWorldQuaternion(new T.Quaternion()));
                spine.quaternion.copy(spine.parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(world);
                avatar.updateWorldMatrix(true, true);
            }
            const ease = value => { const u=T.MathUtils.clamp(value,0,1);return u*u*(3-2*u); };
            const shoulderY=armChains[1][0].getWorldPosition(new T.Vector3()).y;
            const lookPalm=actor.root.localToWorld(new T.Vector3(.275,(Math.min(1.28,shoulderY+.04)-actor.root.position.y)/.80,.35));
            let searchHand=null,searchIndex=-1,searchArm=1,searchBlend=1;
            trial.stock.forEach(record=>{record.rotation.x=record.userData.browseHome;});
            if((browsing||picking)&&trial.stock.length){
                const period=5.2,phase=actor.elapsed%period,span=trial.stock.length-1;
                const sweep=T.MathUtils.clamp((phase-.75)/3.35,0,1)*trial.stock.length;
                const index=picking?Math.floor(span/2):Math.min(span,Math.floor(sweep));searchIndex=index;
                if(browsing&&phase>.75&&phase<4.1){
                    const local=sweep-index;
                    trial.stock[index].rotation.x+=Math.sin(Math.PI*local)*.19;
                }
                const targetFor=record=>{
                    record.updateWorldMatrix(true,false);
                    const top=record.localToWorld(new T.Vector3(-.255,.265,.015));
                    top.addScaledVector(new T.Vector3(0,0,1).transformDirection(actor.root.matrixWorld),config.family==='a11'?-.16:-.065);
                    top.y+=.018;return top;
                };
                const contact=targetFor(trial.stock[index]);
                if(browsing){
                    if(phase<.75){searchHand=targetFor(trial.stock[0]);searchBlend=ease(phase/.75);}
                    else if(phase<4.1){const next=Math.min(span,index+1);searchHand=contact.lerp(targetFor(trial.stock[next]),ease(sweep-index));}
                    else{searchHand=targetFor(trial.stock[span]);searchBlend=1-ease((phase-4.1)/1.1);}
                    if(reachCost(0,searchHand)<reachCost(1,searchHand))searchArm=0;
                }else{
                    const seconds=actor.elapsed;
                    if(seconds<.7){searchHand=contact;searchBlend=ease(seconds/.7);}
                    else if(seconds<1.45){const lifted=contact.clone().addScaledVector(new T.Vector3(0,0,1).transformDirection(actor.root.matrixWorld),-.08);lifted.y+=.07;searchHand=contact.lerp(lifted,ease((seconds-.7)/.75));}
                    else{const lifted=contact.clone().addScaledVector(new T.Vector3(0,0,1).transformDirection(actor.root.matrixWorld),-.08);lifted.y+=.07;searchHand=lifted.lerp(lookPalm,ease((seconds-1.45)/1.15));}
                    actor.album.visible=seconds>.7;
                    if(seconds>.7){pickedRecord=trial.stock[index];pickedRecord.visible=false;}
                }
            }
            if(actor.state==='examining')searchHand=lookPalm;
            if(searchHand){
                if(searchArm!==lastSearchArm)haveRecordTarget=false;lastSearchArm=searchArm;
                if(!haveRecordTarget){smoothRecordHand.copy(searchHand);haveRecordTarget=true;}
                smoothRecordHand.lerp(searchHand,Math.min(1,dt*16));hands[searchArm].copy(smoothRecordHand);
            }else haveRecordTarget=false;
            const usingRecord = actor.album.visible && !actor.recordOnCounter;
            const needs = [usingPhone || browsing&&searchArm===0, browsing&&searchArm===1 || picking || usingRecord || actor.state === 'place-record' || actor.state === 'pick-up-record'];
            const phoneIndex = config.family === 'a11' ? Math.max(0, armChains.findIndex(chain => chain[2] && /Middle1R$/i.test(chain[2].name.replace(/\W/g, '')))) : 0;
            if (config.family === 'a11' && phoneIndex !== 0 && usingPhone) {
                needs[0] = false; needs[1] = true;
                const mirrored = actor.root.worldToLocal(hands[0].clone()); mirrored.x *= -1; hands[1].copy(actor.root.localToWorld(mirrored));
                const phone = actor.root.worldToLocal(actor.phone.position.clone()); phone.x *= -1; actor.phone.position.copy(actor.root.localToWorld(phone));
            }
            for (let i = 0; i < 2; i++) {
                if (config.family === 'a05' && !needs[i] && actor.walkBlend > .001 && armChains[i][0]) {
                    const bone = armChains[i][0], axis = new T.Vector3(1, 0, 0).transformDirection(actor.root.matrixWorld);
                    const world = new T.Quaternion().setFromAxisAngle(axis, Math.sin(actor.step + i * Math.PI) * .15 * actor.walkBlend).multiply(bone.getWorldQuaternion(new T.Quaternion()));
                    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(world);
                    avatar.updateWorldMatrix(true, true);
                }
                const targetWeight=needs[i]?(searchHand&&searchArm===i?searchBlend:1):0;
                ikWeights[i] += (targetWeight - ikWeights[i]) * Math.min(1, dt * 12);
                let normal, finger;
                if (usingPhone && i === phoneIndex) {
                    normal = new T.Vector3(0, 0, 1).applyQuaternion(actor.phone.quaternion);
                    finger = actor.phone.position.clone().sub(hands[i]);
                } else if (usingRecord && i === 1) {
                    normal = new T.Vector3(0, 0, 1).applyQuaternion(actor.album.getWorldQuaternion(new T.Quaternion()));
                    finger = actor.album.getWorldPosition(new T.Vector3()).sub(referenceHands[i]);
                } else {
                    normal = new T.Vector3(0, -1, 0).transformDirection(actor.root.matrixWorld);
                    finger = new T.Vector3(0, 0, 1).transformDirection(actor.root.matrixWorld);
                }
                errors[i] = gripArm(i, hands[i], finger, normal, ikWeights[i]);
            }
            // Props follow the real imported palm while carried, rather than
            // floating at the hidden reference rig's wrist coordinate.
            if (usingRecord && !['place-record', 'pick-up-record'].includes(actor.state) && grips[1]) {
                const offset = grips[1].marker.getWorldPosition(new T.Vector3()).sub(referenceHands[1]);
                const position = actor.album.getWorldPosition(new T.Vector3()).add(offset);
                actor.album.position.copy(actor.album.parent.worldToLocal(position));
            }
            if (actor.phone.visible && grips[phoneIndex]) {
                actor.phone.position.add(grips[phoneIndex].marker.getWorldPosition(new T.Vector3()).sub(hands[phoneIndex]));
            }
            errors.forEach((error, i) => { if (error !== null && needs[i] && ikWeights[i] > .98) maxErrors[i] = Math.max(maxErrors[i], error); });
            if (head && interaction) {
                const axis = new T.Vector3(1, 0, 0).transformDirection(actor.root.matrixWorld);
                const turn = new T.Quaternion().setFromAxisAngle(axis, actor.state==='examining' ? .16 : usingPhone ? .12 : .10);
                const world = turn.multiply(head.getWorldQuaternion(new T.Quaternion()));
                head.quaternion.copy(head.parent.getWorldQuaternion(new T.Quaternion()).invert()).multiply(world);
            }
            if (!anatomyMeasured && trial.asset && config.shoulderHeight) {
                avatar.updateMatrixWorld(true);
                const bounds = new T.Box3(), point = new T.Vector3();
                avatar.traverse(mesh => {
                    if (!mesh.isMesh) return;
                    if (mesh.isSkinnedMesh) mesh.skeleton.update();
                    const positions = mesh.geometry.attributes.position;
                    for (let i = 0; i < positions.count; i++) { point.fromBufferAttribute(positions, i); if (mesh.isSkinnedMesh) mesh.boneTransform(i, point); point.applyMatrix4(mesh.matrixWorld); bounds.expandByPoint(point); }
                });
                const size = bounds.getSize(new T.Vector3()); trial.asset.height = size.y; trial.asset.width = size.x; anatomyMeasured = true;
            }
            ticks++;
            trial.report = { state: actor.state, action: actor.action, visits: actor.visits, paid: actor.paid, visible: actor.root.visible,
                waiting: actor.waitReason, position: actor.position.slice(), stageSeconds: actor.elapsed, bodyLean:lean,searchIndex,searchArm,searchHand:searchHand&&searchHand.toArray(),insideCustomers:api.rigs.filter(r=>r.root.visible).length,clip: config.family === 'a05' && actor.walkBlend > .08 ? 'ShopWalk (adapted)' : currentClip, handError: errors, maxHandError: maxErrors.slice(), ticks };
            return door;
        };
        trial.stats = () => ({ id, name: config.name, rosterMode, totalCharacters: Object.keys(settings).length, visits:actor.visits, ready: trial.ready, error: trial.error, asset: trial.asset, ...trial.report });
        const originalStats = api.stats.bind(api);
        api.stats = () => originalStats().map(state => ({...state, customerId:id, name:config.name}));
        return api;
    };
})();
