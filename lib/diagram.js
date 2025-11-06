// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
/*@flow*/
import { sizeof, obj_as_struct } from './util.js';
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

type DescLine_t = {
    brief?: string,
    name: string,
    bits: string,
    enum?: {[string]:number},
    typedef?: string,
    desc?: string,
    tab?: number
};
type Ctx_t = {
    bit_diagram: string[][],
    description_lines: DescLine_t[],
    used_names: {[string]:number},
    unused_ctr: number,
    bit_offset: number,
    bitfield_ctr: number,
};
type BriefName_t = {
    brief: string,
    name: string,
};
*/

const RESERVED /*:{[string]:number}*/ =
    {'rs':1,'rsv':1,'rsvd':1,'rsrvd':1,'reserv':1,'reservd':1,'reserved':1};

const UNKNOWN /*:{[string]:number}*/ =
    {'un':1,'unk':1,'unkn':1,'unkno':1,'unknow':1,'unknown':1};

const abbreviate_name = (
    name /*:string*/,
    max_letters /*:number*/,
    existing /*:{[string]:number}*/,
) /*:string*/ => {
    if (name.length <= max_letters && !existing[name]) {
        return name;
    }
    // Remove 'r' for reserved and 'u' for unknown.
    const STRIP_BAD_ONE_LETTERS = /[^ABCDEFGHIJKLMNOPQSTUVWXYZabcdefghijklmnopqstvwxyz]/g;

    const spl_name = Object.freeze(name.split('_'));
    if (max_letters === 1) {
        for (const attempt of [
            spl_name[spl_name.length - 1].replace(STRIP_BAD_ONE_LETTERS,'').toUpperCase(),
            spl_name.join('').replace(STRIP_BAD_ONE_LETTERS,'').toUpperCase(),
            'ABCDEFGHIJKLMNOPQSTUVWXYZabcdefghijklmnopqstuvwxyz'
        ]) {
            for (const l of new String(attempt)) {
                if (!existing[l]) { return l; }
            }
        }
        throw new Error(`Impossible to represent ${name} as 1 letter`);
    }

    let out = '';
    const test = (name /*:string*/) => {
        name = name.toLowerCase();
        if (name.length > max_letters) { return false; }
        if (RESERVED[name] || UNKNOWN[name] || existing[name]) { return false; }
        out = name;
        return true;
    };
    const STRIP_VOWELS = /[^BCDFGHJKLMNPQSTVWXZbcdfghjklmnpqstvwxz]/g;
    if (test(spl_name.join(''))) return out;
    if (test(spl_name.join('').replace(STRIP_VOWELS,''))) return out;

    const acronym = spl_name.map((x,i) => (i === spl_name.length - 1) ? '' : x[0]).join('');
    if (test((acronym + spl_name[spl_name.length - 1]).slice(0,max_letters))) return out;
    if (test((acronym + spl_name[spl_name.length - 1].replace(STRIP_VOWELS,'')).slice(0,max_letters))) return out;
    if (test(spl_name.map((x,i) => (i === spl_name.length - 1) ? x : x[0]).join(''))) return out;
    throw new Error(`Out of ideas for how to make a short name from ${name}`);
};

const max_letters = (bits /*:number*/) /*:number*/ => bits * 2 - 1;

const mk_padding = (bits /*:number*/) /*:string*/ => Array(bits).fill('  ').join('').slice(1);

const pad_name = (brief /*:string*/, bits /*:number*/) /*:string*/ => {
    if (bits > 32) {
        bits = 32;
    }
    const ml = max_letters(bits);
    if (brief.length > ml) {
        throw new Error(`Brief name ${brief} is not short enough (max letters: ${ml})`);
    }
    for (let i = 0; brief.length < ml; i++) {
        if (i%2) {
            brief = brief + ' ';
        } else {
            brief = ' ' + brief;
        }
    }
    return brief;
};


const select_name = (ctx /*:Ctx_t*/, obj /*:Object_t|BitFieldItem_t*/) /*:BriefName_t*/ => {
    const name = obj.name || (`unused_` + ctx.unused_ctr++);
    const brief = abbreviate_name(name, max_letters(sizeof(obj)), ctx.used_names);
    ctx.used_names[brief] = 1;
    return {brief, name};
};

const parse_bitfield = (ctx /*:Ctx_t*/, obj /*:BitField_t*/) => {
    if (obj.bits > 32) {
        throw new Error(`${obj._fqn} Bitfields over 32 bits wide are not currently supported`);
    }
    ctx.description_lines.push({
        name: `bitfield_${ctx.bitfield_ctr++}`,
        bits: `${obj.bits} bit`,
    });
    for (const field of obj.fields) {
        const {brief, name} = select_name(ctx, field);
        ctx.bit_offset += field.bits;
        ctx.bit_diagram.push([pad_name(brief, field.bits)]);
        let bits;
        if (obj.bits === 32) {
            if (field._bitrange.length === 1) {
                bits = `bit ${field._bitrange[0]}`;
            } else {
                bits = `bits ${field._bitrange[field._bitrange.length-1]}..${field._bitrange[0]}`;
            }
        } else {
            bits = `${field.bits} bit`;
        }
        ctx.description_lines.push({
            brief,
            name,
            bits,
            enum: field.enum,
            desc: field.desc,
            tab: 1,
        });
    }
};

const push_blob = (ctx /*:Ctx_t*/, brief /*:string*/, fqn /*:string*/, bits /*:number*/) => {
    if (bits < 32) {
        if (Math.floor(ctx.bit_offset / 32) !== Math.floor((ctx.bit_offset + bits - 1) / 32)) {
            // TODO, make the neat drawings of around small byte arrays that cross word boundaries...
            throw new Error(`Object ${fqn} straddles a 32 bit boundary ` +
                            `and this is currently not supported. (` +
                            `${ctx.bit_offset} -> ${Math.floor(ctx.bit_offset + bits)})`);
        }
        ctx.bit_offset += bits;
        ctx.bit_diagram.push([pad_name(brief, bits)]);
        return;
    }
    ctx.bit_offset += bits;
    if (bits % 32) {
        throw new Error(`Object ${fqn} not an even number of 32 bit words in size ` +
                        `and this is currently not supported. Width: ${bits}`);
    }
    // Include internal separators
    const total_lines = (bits / 32) * 2 - 1;
    const begin_space = [];
    const end_space = [];
    for (let i = 0; i < total_lines - 1; i++) {
        if (i%2) {
            begin_space.push(mk_padding(32));
        } else {
            end_space.push(mk_padding(32));
        }
    }
    const lines = [];
    lines.push(...begin_space);
    lines.push(pad_name(brief, bits));
    lines.push(...end_space);
    ctx.bit_diagram.push(lines);
}

const parse_union = (ctx /*:Ctx_t*/, obj /*:UnionField_t*/) => {
    const bits = sizeof(obj);
    const {brief, name} = select_name(ctx, obj);
    ctx.description_lines.push({
        brief,
        name,
        bits: `${bits} bit`,
        desc: obj.desc,
    });
    push_blob(ctx, brief, obj._fqn, bits);
};

const parse_opaque = (ctx /*:Ctx_t*/, obj /*:OpaqueField_t*/) => {
    const bits = sizeof(obj);
    const {brief, name} = select_name(ctx, obj);
    ctx.description_lines.push({
        brief,
        name,
        bits: `${bits} bit`,
        desc: obj.desc,
    });
    push_blob(ctx, brief, obj._fqn, bits);
};

const parse_word = (ctx /*:Ctx_t*/, obj /*:WordField_t*/) => {
    const {brief, name} = select_name(ctx, obj);
    ctx.description_lines.push({
        brief,
        name,
        bits: `${obj.bits} bit`,
        enum: obj.enum,
        typedef: obj.typedef,
        desc: obj.desc,
    });
    if (obj.bits === 64) {
        ctx.bit_diagram.push([mk_padding(32), pad_name(brief, 32), mk_padding(32)]);
        // boundary line
    } else if (obj.bits > 32) {
        // Shouldn't happen
        throw new Error(`Word ${obj._fqn} has size ${obj.bits} which is unsupported`);
    }
    ctx.bit_diagram.push([pad_name(brief, obj.bits)]);
    ctx.bit_offset += obj.bits;
};

const parse_struct = (ctx /*:Ctx_t*/, obj /*:StructField_t*/) => {
    obj.fields.forEach((field) => {
        if (field.type === 'bitfield') {
            parse_bitfield(ctx, field);
        } else if (field.type === 'struct') {
            parse_struct(ctx, field);
        } else if (field.type === 'opaque') {
            parse_opaque(ctx, field);
        } else if (field.type === 'union') {
            parse_union(ctx, field);
        } else if (field.type === 'word') {
            parse_word(ctx, field);
        } else {
            throw new Error(`Unknown field type: ${field.type}`);
        }
    });
}

const describe_markdown = (description_lines /*:DescLine_t[]*/) => {
    for (const desc of description_lines) {
        const line = [`- \`${desc.brief || desc.name}\` `];
        if (desc.name !== desc.brief) { line.push(`"\`${desc.name}\`" `); }
        line.push(`(${desc.bits}): `);
        if (desc.typedef) {
            line.push(`typedef ${desc.typedef} `);
        }
        if (desc.desc) {
            line.push(desc.desc);
        }
        // console.log(desc);
        console.log(line.join(''));
    }
};

const describe_comment = (description_lines /*:DescLine_t[]*/) => {
    for (const desc of description_lines) {
        let line = ` * ` + Array(desc.tab || 0).fill('  ').join('') + `@${desc.name} `;
        if (desc.brief && desc.name !== desc.brief) { line += `"${desc.brief}" `; }
        line += `(${desc.bits}):`;
        const pfx = ' * ' + Array(line.length - 3).fill(' ').join('');

        (desc.desc || '').split(' ').forEach((word) => {
            const nl = (line + ' ' + word);
            if (nl.length > 80) {
                console.log(line);
                line = pfx + ' ' + word;
            } else {
                line = nl;
            }
        });
        console.log(line);
    }
};

export function diagram(obj /*:Object_t*/, style /*:'markdown'|'comment'*/) {
    const ctx /*:Ctx_t*/ = {
        bit_diagram: [],
        description_lines: [],
        used_names: {},
        unused_ctr: 0,
        bit_offset: 0,
        bitfield_ctr: 0,
    };
    parse_struct(ctx, obj_as_struct(obj));
    let prefix = '';
    if (style === 'comment') {
        console.log('/**');
        console.log(' * ' + (obj.name || obj._fqn) + (obj.desc ? (' - ' + obj.desc) : ''));
        prefix = ' * ';
        console.log(prefix);
    } else {
        console.log('```');
    }
    const pad = '    ';
    
    console.log(prefix+pad+' 3                     2                   1                   0');
    console.log(prefix+pad+' 1 0 9 8 7 6 5 4 3 2 1 0 9 8 7 6 5 4 3 2 1 0 9 8 7 6 5 4 3 2 1 0');
    console.log(prefix+pad+'+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+');
    let line = '|';
    let word = 0;
    const print_word = () => {
        const w = (''+word) + ' ';
        if (w.length < pad.length) {
            return Array(pad.length - w.length).fill(' ').join('') + w;
        }
        return w;
    }
    for (const elem of ctx.bit_diagram) {
        if (line.length >= 65) {
            console.log(prefix+print_word() + line);
            console.log(prefix+pad+'+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+');
            line = '|';
            word += 4;
        }
        line = line + elem[0] + '|';
        for (let i = 1; i < elem.length; i++) {
            if (line[0] === '+') {
                console.log(prefix+pad+line);
            } else {
                console.log(prefix+print_word() + line);
            }
            if (i%2) {
                line = '+' + elem[i] + '+';
            } else {
                line = '|' + elem[i] + '|';
                word += 4;
            }
        }
        // console.log(elem);
    }
    console.log(prefix+print_word() + line);
    console.log(prefix+pad+'+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+');
    word += 4;
    console.log(prefix+print_word());
    if (style !== 'comment') {
        console.log('```');
    }
    console.log(prefix);
    if (style === 'comment') {
        describe_comment(ctx.description_lines);
        console.log(' */');
    } else {
        describe_markdown(ctx.description_lines);
    }
}