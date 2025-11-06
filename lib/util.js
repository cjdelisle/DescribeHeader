// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
/*@flow*/
/*::
import type {
    StructField_t,
    WordField_t,
    BitField_t,
    BitFieldItem_t,
    OpaqueField_t,
    Object_t,
    Enum_t,
} from './types.js';
*/

// const sizeof_struct = (obj: /*:StructField_t*/)

export function type_for_bits(bits /*:number*/) /*:string*/ {
    if (bits <= 64) {
        if (bits < 8) {
            return 'u8';
        }
        return 'u' + 2**Math.ceil(Math.log2(bits));
    }
    throw new Error(`No word type with ${bits} bits`);
}

export function sizeof(obj /*:Object_t|BitFieldItem_t*/) /*:number*/ {
    if (obj.type === 'word' || obj.type === 'bitfield') {
        return obj.bits;
    }
    if (obj.type === 'struct') {
        let total_bits = 0;
        for (const field of obj.fields) {
            total_bits += sizeof(field);
        }
        return total_bits;
    }
    if (obj.type === 'opaque') {
        return obj.bytes * 8;
    }
    if (obj.type === 'union') {
        let largest = 0;
        obj.fields.forEach((m) => {
            const s = sizeof(m);
            if (s > largest) { largest = s; }
        });
        return largest;
    }
    if ('bits' in obj && typeof(obj.bits) === 'number') {
        return obj.bits;
    }
    throw new Error(`unexpected type: ${obj.type}`);
};

export function obj_as_struct(obj /*:Object_t*/) /*:StructField_t*/ {
    const fake_root = Object.freeze({
        type: 'struct',
        fields: [ obj ],
        _fqn: '',
        _align: 1024,
    });
    return (fake_root /*:any*/);
}