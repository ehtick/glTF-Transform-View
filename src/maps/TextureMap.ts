import { TextureInfo } from '@gltf-transform/core';
import { pool } from '../ObjectPool';
import { ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, LinearMipmapNearestFilter, MirroredRepeatWrapping, NearestFilter, NearestMipmapLinearFilter, NearestMipmapNearestFilter, RepeatWrapping, Texture, TextureEncoding, TextureFilter, Wrapping } from 'three';
import { ObserverMap } from './ObserverMap';

const WEBGL_FILTERS: Record<number, TextureFilter> = {
	9728: NearestFilter,
	9729: LinearFilter,
	9984: NearestMipmapNearestFilter,
	9985: LinearMipmapNearestFilter,
	9986: NearestMipmapLinearFilter,
	9987: LinearMipmapLinearFilter
};

const WEBGL_WRAPPINGS: Record<number, Wrapping> = {
	33071: ClampToEdgeWrapping,
	33648: MirroredRepeatWrapping,
	10497: RepeatWrapping
};

interface TextureParams {
	encoding: TextureEncoding,
	minFilter: TextureFilter,
	magFilter: TextureFilter,
	wrapS: Wrapping,
	wrapT: Wrapping,
}

export class TextureMap extends ObserverMap<Texture, Texture, TextureParams> {
	protected _createVariant(srcTexture: Texture, params: TextureParams): Texture {
		const dstTexture = this._updateVariant(srcTexture, pool.request(srcTexture.clone()), params);

		if (dstTexture.image.complete) {
			dstTexture.needsUpdate = true;
		} else {
			dstTexture.image.onload = () => (dstTexture.needsUpdate = true);
		}

		return dstTexture;
	}

	protected _updateVariant(srcTexture: Texture, dstTexture: Texture, params: TextureParams): Texture {
		dstTexture.copy(srcTexture);
		dstTexture.minFilter = params.minFilter;
		dstTexture.magFilter = params.magFilter;
		dstTexture.wrapS = params.wrapS;
		dstTexture.wrapT = params.wrapT;
		dstTexture.encoding = params.encoding;
		return dstTexture;
	}

	protected _disposeVariant(texture: Texture): void {
		pool.release(texture).dispose();
	}

	public static createParams(textureInfo: TextureInfo, encoding: TextureEncoding): TextureParams {
		return {
			minFilter: WEBGL_FILTERS[textureInfo.getMinFilter() as number] || LinearMipmapLinearFilter,
			magFilter: WEBGL_FILTERS[textureInfo.getMagFilter() as number] || LinearFilter,
			wrapS: WEBGL_WRAPPINGS[textureInfo.getWrapS()] || RepeatWrapping,
			wrapT: WEBGL_WRAPPINGS[textureInfo.getWrapT()] || RepeatWrapping,
			encoding: encoding,
		}
	}
}