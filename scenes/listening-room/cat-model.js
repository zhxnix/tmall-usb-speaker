/* Offline CC0 mobile cat, adapted from Vuena/Popyca's Cute Pets free sample.
 * Original bone weights and animations; no network, glTF loader or per-frame rebatching.
 */
(function () {
    'use strict';
    window.createRiggedShopCat = function (T, parent) {
        const data = window.SHOP_CAT_ASSET, arrays = new Map();
        function array(index) {
            if (!arrays.has(index)) {
                const source = data.accessors[index], bytes = atob(source.data);
                const buffer = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
                const type = { Float32Array, Uint8Array, Uint16Array }[source.type];
                arrays.set(index, new type(buffer.buffer));
            }
            return arrays.get(index);
        }
        const model = new T.Group(); model.name = 'CC0 rigged shop kitten';
        model.scale.setScalar(1.10); parent.add(model);
        const jointSet = new Set(data.skin.joints);
        const nodes = data.nodes.map((source, i) => {
            const node = jointSet.has(i) ? new T.Bone() : new T.Group();
            node.name = 'ShopCat_' + (source.name || i);
            if (source.translation) node.position.fromArray(source.translation);
            if (source.rotation) node.quaternion.fromArray(source.rotation);
            if (source.scale) node.scale.fromArray(source.scale);
            return node;
        });
        data.nodes.forEach((source, i) => (source.children || []).forEach(child => nodes[i].add(nodes[child])));
        model.add(nodes[21]);
        const geometry = new T.BufferGeometry();
        const names = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', JOINTS_0: 'skinIndex', WEIGHTS_0: 'skinWeight' };
        for (const key of Object.keys(data.attributes)) {
            const index = data.attributes[key];
            geometry.setAttribute(names[key], new T.BufferAttribute(array(index), data.accessors[index].itemSize));
        }
        geometry.setIndex(new T.BufferAttribute(array(data.indices), 1));
        let textureReady = false;
        const texture = new T.TextureLoader().load(data.texture, () => { textureReady = true; });
        texture.encoding = T.sRGBEncoding; texture.flipY = false; texture.anisotropy = 2;
        const material = new T.MeshLambertMaterial({ map: texture, color: '#e9dfcc', side: T.FrontSide });
        const mesh = new T.SkinnedMesh(geometry, material);
        mesh.name = 'Mobile kitten (weighted skin)'; mesh.frustumCulled = false;
        mesh.castShadow = false; mesh.receiveShadow = false; model.add(mesh);
        const inverse = array(data.skin.inverseBindMatrices), inverses = [];
        for (let i = 0; i < data.skin.joints.length; i++) inverses.push(new T.Matrix4().fromArray(inverse, i * 16));
        const skeleton = new T.Skeleton(data.skin.joints.map(i => nodes[i]), inverses);
        model.updateMatrixWorld(true); mesh.bind(skeleton, new T.Matrix4());
        const mixer = new T.AnimationMixer(model), actions = {};
        for (const clip of data.animations) {
            const tracks = clip.channels.map(channel => {
                const property = { translation: 'position', rotation: 'quaternion', scale: 'scale' }[channel.path];
                const values = array(channel.output).slice();
                // Navigation owns the jump's world height; do not add root motion twice.
                if (channel.node === 18 && channel.path === 'translation') {
                    for (let i = 0; i < values.length; i += 3) { values[i] = 0; values[i + 1] = 0; values[i + 2] = 0; }
                }
                const Track = channel.path === 'rotation' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
                return new Track(nodes[channel.node].name + '.' + property, array(channel.input), values);
            });
            actions[clip.name] = mixer.clipAction(new T.AnimationClip(clip.name, -1, tracks).optimize());
        }
        let current = actions.idle, clipName = 'idle'; current.play();
        const head = nodes[4], leftPaw = nodes[7];
        return {
            model, mesh,
            update(dt, time, state) {
                let next = 'idle';
                if (state.sleep > .5) next = 'sleep';
                else if (state.jumping) next = 'jump';
                else if (state.walking > .08) next = 'walk';
                else if (state.kind === 'settling' || state.kind === 'preparing') next = 'sit';
                else if (state.kind === 'grooming' || state.kind.indexOf('sniffing') === 0) next = 'eat';
                else if (state.kind === 'looking-around' || state.kind === 'watching-snow') next = 'idle_alt';
                if (next !== clipName) {
                    const action = actions[next]; action.reset().play();
                    current.crossFadeTo(action, next === 'sleep' ? .8 : .30, false);
                    current = action; clipName = next;
                }
                current.timeScale = next === 'walk' ? Math.max(.30, Math.min(1.5, state.walking * 1.1)) : 1;
                mixer.update(dt);
                if (state.paw > 0) leftPaw.rotateX(-state.paw * .55);
                if (state.sleep < .5 && state.walking < .1) head.rotateZ(Math.sin(time * .7) * .025);
                model.position.y = 0;
            },
            stats() { return { source: 'Vuena / Popyca, CC0', rigged: true, bones: 19, triangles: data.triangles, animation: clipName, textureReady }; }
        };
    };
})();
