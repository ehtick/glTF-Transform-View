import { Accessor as AccessorDef, Material as MaterialDef, Mesh as MeshDef, Node as NodeDef, Primitive as PrimitiveDef, Property as PropertyDef, PropertyType, Scene as SceneDef, Texture as TextureDef } from '@gltf-transform/core';
import { AccessorBinding, Binding, MaterialBinding, MeshBinding, NodeBinding, PrimitiveBinding, SceneBinding, TextureBinding } from './bindings';

// export enum UpdateMask {
// 	SHALLOW = 0x0000,
// 	DEEP = 0x1000,
// 	TEXTURE_DATA = 0x0100,
// 	VERTEX_DATA = 0x00100,
// }

// TODO(bug): Deep syncs are pretty messy... how do we prevent updating the same (reused) Mesh many times? Front recursion?
export class UpdateContext {
	public id = 1;
	public deep = true;

	private bindings = new Set<Binding<PropertyDef, any>>();
	private _sourceMap = new WeakMap<PropertyDef, Binding<PropertyDef, any>>();

	public add(renderer: Binding<PropertyDef, any>): void {
		this.bindings.add(renderer);
		this._sourceMap.set(renderer.source, renderer);
	}

	public bind(source: null): null;
	public bind(source: AccessorDef): AccessorBinding;
	public bind(source: MaterialDef): MaterialBinding;
	public bind(source: MeshDef): MeshBinding;
	public bind(source: NodeDef): NodeBinding;
	public bind(source: PrimitiveDef): PrimitiveBinding;
	public bind(source: SceneDef): SceneBinding;
	public bind(source: PropertyDef): Binding<PropertyDef, any>;
	public bind(source: PropertyDef | null): Binding<PropertyDef, any> | null {
		if (!source) return null;
		if (this._sourceMap.has(source)) return this._sourceMap.get(source)!;

		switch (source.propertyType) {
			case PropertyType.ACCESSOR:
				return new AccessorBinding(this, source as AccessorDef).update();
			case PropertyType.MATERIAL:
				return new MaterialBinding(this, source as MaterialDef).update();
			case PropertyType.MESH:
				return new MeshBinding(this, source as MeshDef).update();
			case PropertyType.NODE:
				return new NodeBinding(this, source as NodeDef).update();
			case PropertyType.PRIMITIVE:
				return new PrimitiveBinding(this, source as PrimitiveDef).update();
			case PropertyType.SCENE:
				return new SceneBinding(this, source as SceneDef).update();
			case PropertyType.TEXTURE:
				return new TextureBinding(this, source as TextureDef).update();
			default:
				throw new Error(`Unimplemented type: ${source.propertyType}`);
		}
	}

	public dispose(): void {
		for (const renderer of this.bindings) {
			renderer.dispose();
		}
	}
}
