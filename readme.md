# DescribeHeader
This is a tool to generate structure layouts and basic accessors
from binary data structure description in yaml.

It is NOT intended to output final form code, it is designed to create
"90% code" that only needs minor adjustments for final includion. Don't
consider it as a labor-saving tool but rather as helping ensure that
your structures are written correctly.

## Using the tool

Install the dependencies:

```sh
npm install
```

Generate the example:

```sh
./dh.js ./models/example.yaml
```

## Input
The input is a yaml file describing the structure, please look at
[example.yaml](https://github.com/cjdelisle/DescribeHeader/blob/master/models/example.yaml)
for a documented example of how to write models.

You can also look at the 
[schema.yaml](https://github.com/cjdelisle/DescribeHeader/blob/master/lib/schema.yaml)
which imposes *almost* all of the rules.

## Output
The output of example.yaml is shown below exactly as it is:

```c
/**
 * example - Example Struct
 * 
 *      3                     2                   1                   0
 *      1 0 9 8 7 6 5 4 3 2 1 0 9 8 7 6 5 4 3 2 1 0 9 8 7 6 5 4 3 2 1 0
 *     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *   0 |    my_byte    |E|cla|  count  |               un              |
 *     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *   4 |    unused_0   |            unused_1           |     byte_7    |
 *     +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *   8 
 * 
 * @my_byte (8 bit): 
 * @bitfield_0 (8 bit): 
 *   @enabled "E" (1 bit): 
 *   @class "cla" (2 bit): Enum example
 *   @count (5 bit): Simple uint example
 * @un (16 bit): Example of a union, size is that of the largest member
 * @unused_0 (8 bit): This is an unused byte
 * @unused_1 (16 bit): 
 * @byte_7 (8 bit): 
 */
struct example {
	u8 my_byte;
	u8 bitfield_0;
	union {
		struct some_other_thing as_external_thing;
		u16 as_word;
		u8 as_bytes[2];
	} un;
	u8 unused_0[1];
	u8 unused_1[2];
	u8 byte_7;
};

/* example bitfield_0 */

enum ex_class {
	EX_CLASS_A					= 0,
	EX_CLASS_B					= 1,
	EX_CLASS_C					= 2,
	EX_CLASS_D					= 3,
};

#define EX_ENABLED					BIT(7)
#define EX_CLASS_MASK					GENMASK(6, 5)
#define EX_COUNT_MASK					GENMASK(4, 0)

static inline bool is_ex_enabled(struct example *x) {
	return FIELD_GET(EX_ENABLED, x->bitfield_0);
}
static inline void set_ex_enabled(struct example *x, bool v) {
	x->bitfield_0 = FIELD_SET(x->bitfield_0, EX_ENABLED, v);
}
static inline enum ex_class get_ex_class(struct example *x) {
	return FIELD_GET(EX_CLASS_MASK, x->bitfield_0);
}
static inline void set_ex_class(struct example *x, enum ex_class v) {
	x->bitfield_0 = FIELD_SET(x->bitfield_0, EX_CLASS_MASK, v);
}
static inline u8 get_ex_count(struct example *x) {
	return FIELD_GET(EX_COUNT_MASK, x->bitfield_0);
}
static inline void set_ex_count(struct example *x, u8 v) {
	x->bitfield_0 = FIELD_SET(x->bitfield_0, EX_COUNT_MASK, v);
}
```

## BIT, GENMASK, FIELD_GET, and FIELD_SET
The `BIT`, `GENMASK`, and `FIELD_GET` macros are part of Linux, so you can
just add at the top of your header:

```c
#include <linux/bits.h>
#include <linux/bitfield.h>
#include <linux/types.h>
```

But `FIELD_SET` is not provided. Here is an implementation:

```c
#ifndef FIELD_SET
#define FIELD_SET(current, mask, val)	\
	(((current) & ~(mask)) | FIELD_PREP((mask), (val)))
#endif
```

## License
GPL-2.0-only OR BSD-2-Clause
