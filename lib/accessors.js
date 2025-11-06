// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
/*@flow*/
import { type_for_bits } from './util.js';
/*::
import type {
    StructField_t,
    WordField_t,
    BitField_t,
    BitFieldItem_t,
    OpaqueField_t,
    UnionField_t,
    Object_t,
    Enum_t,
} from './types.js';

type AccessorsRet_t = {
    members: string[],
    accessors: string[],
};
*/

const TAB_LEN = 56;
const tabbed = (left /*:string*/, right /*:string*/) /*:string*/ => {
    const llen = left.replace(/\t/g, '        ').length;
    const tabllen = Math.floor(llen / 8);
    let tabs = ' ';
    if (tabllen < TAB_LEN / 8) {
        tabs = Array((TAB_LEN / 8) - tabllen).fill('\t').join('');
    }
    return `${left}${tabs}${right}`;
};

const print_enum = (fqn /*:string*/, e /*:Enum_t*/) /*:string[]*/ => {
    const out = [];
    out.push(`enum ${fqn} {`);
    for (const name in e) {
        out.push(tabbed(('\t'+fqn+'_'+name).toUpperCase(),'= '+e[name]+','));
    }
    out.push('};');
    return out;
};

const bitfield_accessors = (
    obj /*:BitField_t*/,
    parent_struct /*:string*/,
    parent_fieldname /*:string*/,
) /*:string[]*/ => {
    let struct = parent_struct;
    let fieldname = parent_fieldname;
    const out = [];
    const enums /*:string[]*/ = [];
    const defines = [];
    const accessors /*:string[]*/ = [];
    if (obj.name) {
        struct = obj.name;
        out.push(`struct ${obj.name} { u${obj.bits} word; };`);
        fieldname = 'word';
    } else {
        out.push(`/* ${parent_struct} ${fieldname} */`)
    }
    obj.fields.forEach((f, i) => {
        if (!f.name) { return; }
        if (f.enum) {
            enums.push(...print_enum(f._fqn, f.enum));
        }
        let mask = `${f._fqn.toUpperCase()}_MASK`;
        let isget = 'get';
        let type = type_for_bits(f.bits);
        if (f.bits === 1) {
            mask = f._fqn.toUpperCase();
            defines.push(tabbed(`#define ${mask}`, `BIT(${f._bitrange[0]})`));
            isget = 'is';
            type = 'bool';
        } else {
            defines.push(tabbed(`#define ${mask}`,
                `GENMASK(${f._bitrange[f._bitrange.length-1]}, ${f._bitrange[0]})`));
            if (f.enum) {
                type = `enum ${f._fqn}`;
            }
        }
        accessors.push(
            `static inline ${type} ${isget}_${f._fqn}(struct ${struct} *x) {`,
            '\t'+`return FIELD_GET(${mask}, x->${fieldname});`,
            '}',
            `static inline void set_${f._fqn}(struct ${struct} *x, ${type} v) {`,
            '\t'+`x->${fieldname} = FIELD_SET(x->${fieldname}, ${mask}, v);`,
            '}');
        // console.log(f);
    });
    if (enums.length) {
        out.push('', ...enums);
    }
    if (defines.length) {
        out.push('', ...defines);
    }
    if (accessors.length) {
        out.push('', ...accessors);
    }
    out.push('');
    return out;
};

const accessors_struct = (obj /*:StructField_t|UnionField_t*/, tabs /*:string*/) /*:AccessorsRet_t*/ => {
    if (!obj.name) { throw new Error(); }
    let struct_name = obj.name;
    let fn = 0;
    let bf = 0;
    let accessors /*:string[]*/ = [];
    const members = [];
    obj.fields.forEach((f, i) => {
        if (f.type === 'word') {
            let t = f.typedef ? f.typedef : (f.signed ? 's' : 'u') + f.bits;
            members.push(tabs+t+' '+(f.name || `unused_${fn++}`)+';');
        } else if (f.type === 'opaque') {
            members.push(tabs+(f.decl || `u8 unused_${fn++}[${f.bytes}];`));
        } else if (f.type === 'union') {
            members.push(tabs+`union {`);
            const am = accessors_struct(f, tabs+'\t');
            accessors.push(...am.accessors);
            members.push(...am.members);
            members.push(tabs+`} ${f.name};`);
        } else if (f.type === 'bitfield') {
            const name = f.name || `bitfield_${bf++}`;
            accessors.push(...bitfield_accessors(f, struct_name, name));
            members.push(tabs+'u'+f.bits+' '+name+';');
        } else if (f.type === 'struct') {
            throw new Error('nested structs are currently not supported');
        }
    });
    return { accessors, members };
};

export function accessors(obj /*:Object_t*/) /*:void*/ {
    if (obj.type === 'struct') {
        if (!obj.name) { throw new Error(); }
        const { accessors, members } = accessors_struct(obj, '\t');
        const sd = [
            `struct ${obj.name || ''} {`,
            ...members,
            `};`,
        ];
        console.log(sd.join('\n'));
        console.log();
        console.log(accessors.join('\n'));
        return;
    }
    throw new Error(`Type ${obj.type} not supported yet`);
}