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

const commentize = (str /*:string*/, tabs /*:string*/) /*:string[]*/ => {
    const MAX_CHARS = 80;
    if ((`${tabs}/** ${str} */`).length < MAX_CHARS && str.indexOf('\n') === -1) {
        return [ `${tabs}/** ${str} */` ];
    }
    const PAD = ' * ';
    const allowed_chars = MAX_CHARS - tabs.length - PAD.length;
    const out = ['/**'];
    let el = 0;
    for (;;) {
        while (str[0] === ' ' || str[0] === '\n') {
            if (str[0] === '\n') {
                out.push(PAD);
            }
            str = str.slice(1);
        }
        if (str.length === 0) {
            break;
        }
        if (str.indexOf('\n') > -1 && str.indexOf('\n') <= allowed_chars) {
            el = str.indexOf('\n');
        } else if (str.length <= allowed_chars) {
            out.push(PAD + str);
            break;
        } else {
            const idx = str.lastIndexOf(' ', allowed_chars);
            if (idx === -1) {
                el = str.indexOf(' ');
                if (el === -1) {
                    el = str.length;
                }
            } else {
                el = idx;
            }
        }
        out.push(PAD + str.slice(0, el));
        str = str.slice(el);
        if (str[0] === '\n') { str = str.slice(1); }
    }
    out.push(' */');
    return out.map((l) => tabs + l)
}

const bitfield_accessors = (
    obj /*:BitField_t*/,
    parent_struct /*:string*/,
    parent_fieldname /*:string*/,
    with_comments /*:boolean*/
) /*:{ accessors: string[], accessor_names: string[], }*/ => {
    let struct = parent_struct;
    let fieldname = parent_fieldname;
    const out = [];
    const enums /*:string[]*/ = [];
    const defines = [];
    const accessors /*:string[]*/ = [];
    const accessor_names /*:string[]*/ = [];

    let name = `${parent_struct} ${fieldname}`;
    if (obj.name) {
        name = `struct ${obj.name}`;
    }
    if (with_comments) {
        out.push(...commentize(`Bitfield accessors for: ${name}\n` +
            `${obj.desc || ''}`, ''));
    } else {
        out.push(`/* Bitfield accessors for: ${name} */`);
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
        if (!f.only || f.only === 'read') {
            accessor_names.push(`${isget}_${f._fqn}`);
            if (with_comments && f.desc) {
                const desc = f.desc;
                accessors.push('');
                accessors.push(...commentize(desc, ''));
            }
            accessors.push(
                `static inline ${type} ${isget}_${f._fqn}(struct ${struct} *x) {`,
                '\t'+`return FIELD_GET(${mask}, x->${fieldname});`,
                '}'
            );
        }
        if (!f.only || f.only === 'write') {
            accessor_names.push(`set_${f._fqn}`);
            accessors.push(
                `static inline void set_${f._fqn}(struct ${struct} *x, ${type} v) {`,
                '\t'+`x->${fieldname} = FIELD_SET(x->${fieldname}, ${mask}, v);`,
                '}'
            );
        }
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
    return { accessors: out, accessor_names };
};

const mk_comment = (
    obj /*:Object_t*/,
    with_comments /*:boolean*/,
    tabs /*:string*/
) /*:string[]*/ => {
    if (!with_comments) { return []; }
    if (!obj.name) { return []; }
    return commentize(`${obj._fqn}: ${obj.desc || ''}`, tabs);
};

const bitfield_comment = (
    obj /*:Object_t*/,
    with_comments /*:boolean*/,
    tabs /*:string*/,
    accessor_names /*:string[]*/
) => {
    if (!with_comments) { return []; }
    return commentize(`See accessors:\n${accessor_names.map((a)=>a+'()').join('\n')}`, tabs);
};

const accessors_struct = (
    obj /*:StructField_t|UnionField_t*/,
    tabs /*:string*/,
    with_comments /*:boolean*/
) /*:AccessorsRet_t*/ => {
    if (!obj.name) { throw new Error(); }
    let struct_name = obj.name;
    let fn = 0;
    let bf = 0;
    let accessors /*:string[]*/ = [];
    const members = [];
    obj.fields.forEach((f, i) => {
        if (f.type !== 'bitfield') {
            members.push(...mk_comment(f, with_comments, tabs));
        }
        if (f.type === 'word') {
            let t = f.typedef ? f.typedef : (f.signed ? 's' : 'u') + f.bits;
            members.push(tabs+t+' '+(f.name || `unused_${fn++}`)+';');
        } else if (f.type === 'opaque') {
            members.push(tabs+(f.decl || `u8 unused_${fn++}[${f.bytes}];`));
        } else if (f.type === 'union') {
            members.push(tabs+`union ${f._fqn} {`);
            const am = accessors_struct(f, tabs+'\t', with_comments);
            accessors.push(...am.accessors);
            members.push(...am.members);
            members.push(tabs+`} ${f.name};`);
        } else if (f.type === 'bitfield') {
            if (f.name) {
                const name = f.name;
                const ba = bitfield_accessors(f, name, 'word', with_comments);
                accessors.push(...ba.accessors);
                members.push(...bitfield_comment(f, with_comments, tabs, ba.accessor_names));
                members.push(tabs+`struct ${name} { u${f.bits} word; } ${name};`);
            } else {
                // Anonymous bitfield, accessors take the parent struct as argument
                const name = `bitfield_${bf++}`;
                const ba = bitfield_accessors(f, obj._fqn, name, with_comments);
                accessors.push(...ba.accessors);
                members.push(...bitfield_comment(f, with_comments, tabs, ba.accessor_names));
                members.push(tabs+'u'+f.bits+' '+name+';');
            }
        } else if (f.type === 'struct') {
            if (!f.name) {
                throw new Error(`Handling member ${f._fqn} of struct ${obj._fqn}, ` +
                    `nested structs must have a name`);
            }
            const name = f.name;
            const am = accessors_struct(f, tabs+'\t', with_comments);
            members.push(tabs+`struct ${f._fqn} {`);
            accessors.push(...am.accessors);
            members.push(...am.members);
            members.push(tabs+`} ${name};`);
        }
        members.push('');
    });
    return { accessors, members };
};

export function accessors(obj /*:Object_t*/, with_comments /*:boolean*/) /*:void*/ {
    if (obj.type === 'struct') {
        if (!obj.name) { throw new Error(); }
        const { accessors, members } = accessors_struct(obj, '\t', with_comments);
        const sd = [
            ...mk_comment(obj, with_comments, ''),
            `struct ${obj._fqn || ''} {`,
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