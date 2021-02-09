import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, DoubleSide, FrontSide, Group, LinearEncoding, LinearFilter, LinearMipmapLinearFilter, LinearMipmapNearestFilter, Mesh, MeshStandardMaterial, MirroredRepeatWrapping, NearestFilter, NearestMipmapLinearFilter, NearestMipmapNearestFilter, Object3D, RepeatWrapping, SkinnedMesh, Texture, TextureLoader, sRGBEncoding } from 'three';
import { Accessor as AccessorDef, Document, Material as MaterialDef, Mesh as MeshDef, Node as NodeDef, Texture as TextureDef, TextureInfo as TextureInfoDef } from '@gltf-transform/core';

/**
 * Constructs a THREE.Group hierarchy for a given glTF-Transform {@link Document}.
 *
 * Next:
 * - assignFinalMaterial()
 * - TRS Animation
 * - Skinning
 * - Morph targets
 * - Points, lines, and other modes
 *
 * Later:
 * - Cameras
 * - Extensions
 *
 * @param doc
 */
export async function render(doc: Document): Promise<Group> {
	const root = doc.getRoot();

	const sceneDef = root.listScenes()[0];
	const scene = new Group();
	scene.name = sceneDef.getName();

	// Accessors.

	const accessors = new Map<AccessorDef, BufferAttribute>();
	for (const accessorDef of root.listAccessors()) {
		accessors.set(accessorDef, new BufferAttribute(
			accessorDef.getArray()!,
			accessorDef.getElementSize(),
			accessorDef.getNormalized()
		));
	}

	// Textures.

	const textures = new Map<TextureDef, Texture>();
	const textureLoader = new TextureLoader();
	const texturesPending: Promise<void>[] = [];
	for (const textureDef of root.listTextures()) {
		const blob = new Blob([textureDef.getImage()!], {type: textureDef.getMimeType()});
		const blobURL = URL.createObjectURL(blob);
		texturesPending.push(new Promise((resolve, reject) => {
			textureLoader.load(blobURL, (texture) => {
				textures.set(textureDef, texture);
				resolve();
				URL.revokeObjectURL(blobURL);
			}, undefined, reject);
		}));
	}
	await Promise.all(texturesPending);

	// Materials.

	const materials = new Map<MaterialDef, MeshStandardMaterial>();
	for (const materialDef of root.listMaterials()) {
		const material = new MeshStandardMaterial({
			name: materialDef.getName(),

			color: materialDef.getBaseColorHex(),
			opacity: materialDef.getAlpha(),
			alphaTest: materialDef.getAlphaMode() === 'MASK' ? materialDef.getAlphaCutoff() : 0,
			transparent: materialDef.getAlphaMode() === 'BLEND',

			emissive: materialDef.getEmissiveHex(),

			roughness: materialDef.getRoughnessFactor(),
			metalness: materialDef.getMetallicFactor(),
			aoMapIntensity: materialDef.getOcclusionStrength(),

			side: materialDef.getDoubleSided() ? DoubleSide : FrontSide
		});

		material.map = resolveTexture('baseColorTexture', materialDef.getBaseColorTexture(), materialDef.getBaseColorTextureInfo(), textures);
		material.emissiveMap = resolveTexture('emissiveTexture', materialDef.getEmissiveTexture(), materialDef.getEmissiveTextureInfo(), textures);
		material.roughnessMap = material.metalnessMap = resolveTexture('metallicRoughnessTexture', materialDef.getMetallicRoughnessTexture(), materialDef.getMetallicRoughnessTextureInfo(), textures);
		material.normalMap = resolveTexture('normalTexture', materialDef.getNormalTexture(), materialDef.getNormalTextureInfo(), textures);
		material.aoMap = resolveTexture('occlusionTexture', materialDef.getOcclusionTexture(), materialDef.getOcclusionTextureInfo(), textures);

		materials.set(materialDef, material);
		// TODO(bug): All that assignFinalMaterial() reconciliation.
	}

	// Meshes.

	const meshes = new Map<MeshDef, Group>();
	for (const meshDef of root.listMeshes()) {
		const mesh = new Group();
		mesh.name = meshDef.getName();

		for (const primDef of meshDef.listPrimitives()) {
			const primGeometry = new BufferGeometry();
			const primMaterial = materials.get(primDef.getMaterial()!);
			const prim = primDef.getAttribute('JOINTS_0')
				? new SkinnedMesh(primGeometry, primMaterial)
				: new Mesh(primGeometry, primMaterial);
			prim.name = primDef.getName();

			// Attributes.
			for (const semantic of primDef.listSemantics()) {
				const attributeDef = primDef.getAttribute(semantic)!;
				primGeometry.setAttribute(
					semanticToAttributeName(semantic),
					accessors.get(attributeDef)!
				);
			}

			// Indices.
			const indexDef = primDef.getIndices();
			if (indexDef) primGeometry.setIndex(accessors.get(indexDef)!);

			mesh.add(prim);
		}
		meshes.set(meshDef, mesh);
	}

	// Nodes.

	const nodes = new Map<NodeDef, Object3D>();
	sceneDef.traverse((nodeDef) => {
		const node = new Object3D();
		node.name = nodeDef.getName();
		node.position.fromArray(nodeDef.getTranslation());
		node.quaternion.fromArray(nodeDef.getRotation());
		node.scale.fromArray(nodeDef.getScale());

		const meshDef = nodeDef.getMesh();
		if (meshDef) node.add(meshes.get(meshDef)!);

		nodes.set(nodeDef, node);
		scene.add(node);
	});

	//

	return scene;
}

function semanticToAttributeName(semantic: string): string {
	switch (semantic) {
		case 'POSITION': return 'position';
		case 'NORMAL': return 'normal';
		case 'TANGENT': return 'tangent';
		case 'COLOR_0': return 'color';
		case 'JOINTS_0': return 'skinIndex';
		case 'WEIGHTS_0': return 'skinWeight';
		case 'TEXCOORD_0': return 'uv';
		case 'TEXCOORD_1': return 'uv2';
		default: return '_' + semantic.toLowerCase();
	}
}

const WEBGL_FILTERS = {
	9728: NearestFilter,
	9729: LinearFilter,
	9984: NearestMipmapNearestFilter,
	9985: LinearMipmapNearestFilter,
	9986: NearestMipmapLinearFilter,
	9987: LinearMipmapLinearFilter
};

const WEBGL_WRAPPINGS = {
	33071: ClampToEdgeWrapping,
	33648: MirroredRepeatWrapping,
	10497: RepeatWrapping
};

function applyTextureInfo(texture: Texture, textureInfo: TextureInfoDef): Texture {
	texture = texture.clone();

	texture.flipY = false;
	texture.magFilter = textureInfo.getMagFilter() != null
		? WEBGL_FILTERS[ textureInfo.getMagFilter()! ]
		: LinearFilter;
	texture.minFilter = textureInfo.getMinFilter() != null
		? WEBGL_FILTERS[ textureInfo.getMinFilter()! ]
		: LinearMipmapLinearFilter;
	texture.wrapS = WEBGL_WRAPPINGS[ textureInfo.getWrapS() ];
	texture.wrapT = WEBGL_WRAPPINGS[ textureInfo.getWrapT() ];

	// TODO(feat): Manage uv2.

	texture.needsUpdate = true;
	return texture;
}

function resolveTexture(
		slot: string,
		textureDef: TextureDef | null,
		textureInfoDef: TextureInfoDef | null,
		textureCache: Map<TextureDef, Texture>): Texture | null {
	if (!textureDef || !textureInfoDef) return null;

	const texture = applyTextureInfo(
		textureCache.get(textureDef)!,
		textureInfoDef
	);

	if (slot.match(/color|emissive/i)) texture.encoding = sRGBEncoding;

	return texture;
}