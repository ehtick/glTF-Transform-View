import type { Property as PropertyDef } from '@gltf-transform/core';
import type { UpdateContext } from '../UpdateContext';
import type { Subject } from '../subjects';
import { Observable } from '../utils';
import { EmptyParams } from '../pools';

/**
 * Exposes a limited view of the RefObserver interface to objects
 * using it as an output socket.
 */
export interface Output<Value> extends Observable<Value | null> {
	detach(): void;
}

/**
 * Represents a connection between one Subject's output and another
 * Subject's input. RefObserver should let the Subject call .next(),
 * generally avoiding calling .next() itself. The RefObserver is a passive pipe.
 */
export class RefObserver<Def extends PropertyDef, Value, Params = EmptyParams> extends Observable<Value | null> implements Output<Value> {
	readonly name: string;

	private _subject: Subject<Def, Value> | null = null;
	private _subjectParamsFn: () => Params = () => ({} as Params);

	private readonly _context: UpdateContext;

	constructor(name: string, context: UpdateContext,) {
		super(null);
		this.name = name;
		this._context = context;
	}

	/**************************************************************************
	 * Child interface. (Subject (Child))
	 */

	detach() {
		this._clear();
	}

	next(value: Value | null) {
		// Prevent publishing updates during disposal.
		if (!this._context.isDisposed()) {
			super.next(value);
		}
	}

	/**************************************************************************
	 * Parent interface. (Subject (Parent), ListObserver, MapObserver)
	 */

	setParamsFn(paramsFn: () => Params): this {
		this._subjectParamsFn = paramsFn;
		return this;
	}

	getDef(): Def | null {
		return this._subject ? this._subject.def : null;
	}

	updateDef(def: Def | null) {
		const subject = def ? this._context.bind(def) as Subject<Def, Value> : null;
		if (subject === this._subject) return;

		this._clear();

		if (subject) {
			this._subject = subject;
			this._subject.addOutput(this, this._subjectParamsFn);
			this._subject.publish(this);
		} else {
			// In most cases RefObserver should let the Subject call .next() itself,
			// but this is the exception since the Subject is gone.
			this.next(null);
		}
	}

	/**
	 * Forces the observed Subject to re-evaluate the output. For use when
	 * output parameters are likely to have changed.
	 */
	invalidate() {
		if (this._subject) {
			this._subject.publish(this);
		}
	}

	dispose() {
		this._clear();
	}

	/**************************************************************************
	 * Internal.
	 */

	private _clear() {
		if (this._subject) {
			this._subject.removeOutput(this);
			this._subject = null;
		}
	}
}
