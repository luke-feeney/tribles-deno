const std = @import("std");
const mc = @import("./pact.zig");

const allocator = std.heap.page_allocator;
var global_secret : [16]u8 = undefined;

export fn _initialize() void {
    std.crypto.random.bytes(&global_secret);
}

// Memory
//
export fn alloc(len: usize) [*]u8 {
  const memory = allocator.allocAdvanced(u8, 64, len, std.mem.Allocator.Exact.exact) catch unreachable;
  return memory.ptr;
}

export fn free(mem: [*]u8, len: usize) void {
  allocator.free(mem[0..len]);
}


// Hash
//
export fn secret(i : i32) i32 {
    return global_secret[@intCast(usize, i)];
}

export var global_hash_this : [16]u8 = undefined;
export var global_hash_other : [16]u8 = undefined;
export var global_hash_data : [64]u8 = undefined;

export fn hash_digest(len: usize) void {
  const siphash = comptime std.hash.SipHash128(2, 4);
  siphash.create(&global_hash_this, global_hash_data[0..len], global_secret[0..]);
}

export fn hash_xor() void {
    for(global_hash_other) |other, i| {
        global_hash_this[i] ^= other;
    }
}

export fn hash_equal() bool {
    return std.mem.eql(u8, &global_hash_this, &global_hash_other);
}
