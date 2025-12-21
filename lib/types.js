// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
/*@flow*/

/*::
export type Enum_t = { [string]:number };
export type BaseField_t = {
    short_name?: string,
    desc?: string,
    offset?: number,

    _fqn: string,
    _align: number,
};
export type BitFieldItem_t = BaseField_t & {
    type: 'bit',
    name?: string,
    bits: number,
    enum?: Enum_t,
    only?: 'read'|'write',

    _bitrange: number[],
};
export type BitField_t = BaseField_t & {
    type: 'bitfield',
    name?: string,
    bits: 8|16|32|64,
    fields: BitFieldItem_t[],
};
export type WordField_t = BaseField_t & {
    type: 'word',
    name?: string,
    bits: 8|16|32|64,
    signed?: boolean,
    typedef?: string,
    enum?: Enum_t,
};
export type StructField_t = BaseField_t & {
    type: 'struct',
    name?: string,
    fields: Array<WordField_t | BitField_t | StructField_t | OpaqueField_t | UnionField_t>,
};
export type OpaqueField_t = BaseField_t & {
    type: 'opaque',
    name?: string,
    bytes: number,
    decl?: string,
};
export type UnionField_t = BaseField_t & {
    type: 'union',
    name: string,
    fields: Array<WordField_t | BitField_t | StructField_t | OpaqueField_t>,
};
export type Object_t = OpaqueField_t | WordField_t | BitField_t | StructField_t | UnionField_t;
*/