// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
/*@flow*/
/*::
import type {
    StructField_t,
    WordField_t,
    BitField_t,
    BitFieldItem_t,
    UnionField_t,
    OpaqueField_t,
    Object_t,
    Enum_t,
} from './types.js';
*/

const check_enum = (
    e /*:Enum_t*/,
    min /*:number*/,
    max /*:number*/,
    objname /*:string*/,
) => {
    for (const name in e) {
        if (e[name] < min) {
            throw new Error(`Enum in ${objname} has ${name} = ${e[name]} which is < min val ${min}`);
        } else if (e[name] > max) {
            throw new Error(`Enum in ${objname} has ${name} = ${e[name]} which is > max val ${max}`);
        }
    }
    Object.freeze(e);
};

const mk_name = (
    obj /*:BitFieldItem_t|Object_t*/,
    name /*:string[]*/,
    number /*:number*/
) /*:string[]*/ => {
    const new_name = [...name];
    if (obj.name) {
        const fqn = [];
        if (/^f[0-9]+$/.test(obj.name)) {
            throw new Error(`The name ${obj.name} collides with internal naming system, ` +
                `please use a different name`);
        }
        for (const n of name) {
            if (!/^f[0-9]+$/.test(n)) {
                fqn.push(n);
            }
        }
        fqn.push(obj.short_name || obj.name || '%'); // || '%' type checker
        new_name.push(obj.short_name || obj.name || '%'); // || '%' type checker
        obj._fqn = fqn.join('_');
        if (!obj._fqn) {
            throw new Error(`Object: ${JSON.stringify(obj)} has empty fqn`);
        }
    } else {
        // If anonymous, include *everything* from the fqn
        // This avoids dumb messages like:
        // > Multiple items resolve to fully-qualified name: desc_f3. Please use more distinct names
        new_name.push('f' + number);
        obj._fqn = new_name.join('_');
    }
    Object.freeze(new_name);
    if (!obj.name && obj.short_name) {
        throw new Error(`${obj._fqn} has a short name ${obj.short_name} but no name`);
    }
    return new_name;
};

const mk_align = (obj /*:Object_t*/, byte_offset /*:number*/) => {
    for (let i = 1; i < 128; i <<= 1) {
        if (byte_offset % i) {
            obj._align = i >> 1;
            break;
        }
    }
}

const transform_bitfielditem = (
    obj /*:BitFieldItem_t*/,
    name /*:string[]*/,
    number /*:number*/,
    end_bit /*:number*/ // The first bit AFTER the end
) /*:number*/ => {
    name = mk_name(obj, name, number);

    if (!obj.name && obj.enum) {
        throw new Error(`Bitfield item ${obj._fqn} has an enum despire being nameless (unused)`);
    }

    if (obj.bits < 1 || obj.bits !== Math.floor(obj.bits)) {
        throw new Error(`In bitfield ${obj._fqn}, bits is invalid, must be a positive whole number`);
    }

    if (obj.enum) {
        check_enum(obj.enum, 0, (1<<obj.bits) - 1, obj._fqn);
    }

    obj._bitrange = [];
    for (let i = end_bit - obj.bits; i < end_bit; i++) {
        obj._bitrange.push(i);
    }
    Object.freeze(obj);
    return obj.bits;
};

const transform_bitfield = (
    obj /*:BitField_t*/,
    byte_offset /*:number*/,
    name /*:string[]*/,
) /*:number*/ => {
    let bit_offset = Number(obj.bits); // Cast for flow because the type is '8|16|32|64'
    obj.fields.forEach((field, i) => {
        bit_offset -= transform_bitfielditem(field, name, i, bit_offset);
    });
    if (bit_offset !== 0) {
        throw new Error(`${obj._fqn} bit field widths do not add up to word size, off by ${bit_offset}`);
    }
    return byte_offset + obj.bits / 8;
};

const transform_word = (
    obj /*:WordField_t*/,
    byte_offset /*:number*/,
) /*:number*/ => {
    if (byte_offset % (obj.bits / 8)) {
        throw new Error(`${obj._fqn} does not have required alignment`);
    }
    if (!obj.name) {
        if ('enum' in obj) {
            throw new Error(`${obj._fqn} has an enum despite being nameless (unused)`);
        }
        if ('typedef' in obj) {
            throw new Error(`${obj._fqn} has a typedef despite being nameless (unused)`);
        }
        if ('signed' in obj) {
            throw new Error(`${obj._fqn} has a signed attribute despite being nameless (unused)`);
        }
    }
    if (obj.enum) {
        let min = 0
        let max = 2**obj.bits;
        if (obj.signed) {
            max /= 2;
            min = -max;
        }
        check_enum(obj.enum, min, max - 1, obj._fqn);
    }
    return byte_offset + obj.bits / 8;
};

const transform_struct = (
    obj /*:StructField_t*/,
    byte_offset /*:number*/,
    name /*:string[]*/,
) /*:number*/ => {
    const fields = [];
    let i = 0;
    obj.fields.forEach((field) => {
        if (field.offset) {
            const fo = field.offset;
            if (fo !== byte_offset) {
                throw new Error(`Handling field ${field.name || i} of ${obj._fqn} - ` +
                    `Specified offset is ${field.offset} but there are ${byte_offset} bytes ` +
                    `of other fields behind this one`
                );
            }
        }
        byte_offset = transform_obj(field, byte_offset, name, i++);
        fields.push(field);
    });
    obj.fields = fields;
    return byte_offset;
};

const transform_opaque = (
    obj /*:OpaqueField_t*/,
    byte_offset /*:number*/,
    name /*:string[]*/,
) /*:number*/ => {
    return byte_offset + obj.bytes;
};

const transform_union = (
    obj /*:UnionField_t*/,
    byte_offset /*:number*/,
    name /*:string[]*/,
) /*:number*/ => {
    let max_offset = byte_offset;
    obj.fields.forEach((field, i) => {
        const os = transform_obj(field, byte_offset, name, i);
        if (field.offset) {
            throw new Error(`Field ${field._fqn} of union ${obj._fqn} has offset ` +
                `which is illegal for union members`);
        }
        if (field.type === 'opaque') {
            if (!('decl' in field)) {
                throw new Error(`Opaque field ${field._fqn} of union ${obj._fqn} has no ` +
                    `'decl' property is required for union members`);
            }
        } else if (!field.name) {
            throw new Error(`Field ${field._fqn} of union ${obj._fqn} has no ` +
                `'name' property is required for union members`);
        }
        if (os > max_offset) {
            max_offset = os;
        }
    });
    return max_offset;
};

const transform_obj = (
    obj /*:Object_t*/,
    byte_offset /*:number*/,
    name /*:string[]*/,
    number /*:number*/
) /*:number*/ => {
    name = mk_name(obj, name, number);
    mk_align(obj, byte_offset);

    if (obj.type === 'opaque') {
        byte_offset = transform_opaque(obj, byte_offset, name);
    } else if (obj.type === 'union') {
        byte_offset = transform_union(obj, byte_offset, name);
    } else if (obj.type === 'word') {
        byte_offset = transform_word(obj, byte_offset);
    } else if (obj.type === 'bitfield') {
        byte_offset = transform_bitfield(obj, byte_offset, name);
    } else if (obj.type === 'struct') {
        byte_offset = transform_struct(obj, byte_offset, name);
    }

    Object.freeze(obj);
    return byte_offset;
};

const check_dup_names = (obj /*:Object_t|BitField_t*/, names /*:{[string]:number}*/) /*:void*/ => {
    if (names[obj._fqn]) {
        throw new Error(`Multiple items resolve to fully-qualified name: "${obj._fqn}". ` +
            `Please use more distinct names in your structure or avoid anonymous bitfields`);
    }
    names[obj._fqn] = 1;
    if ('enum' in obj) {
        for (const key in (obj/*:any*/).enum) {
            const ename = obj._fqn.toUpperCase() + '_' + key;
            if (names[ename]) {
                throw new Error(`Enum entry ${key} in ${obj._fqn} resolves to ${ename} ` +
                    `which is used in multiple places`);
            }
        }
    }
    if ('fields' in obj) {
        for (const f of (obj/*:any*/).fields) {
            check_dup_names(f, names);
        }
    }
    if ('member_type' in obj) {
        check_dup_names((obj/*:any*/).member_type, names);
    }
};

export function transform(obj /*:Object_t*/) {
    transform_obj(obj, 0, [], 0);
    // console.log(JSON.stringify(obj, null, '\t'));
    check_dup_names(obj, {});
}