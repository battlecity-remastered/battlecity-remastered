(module
  (func $octile (param $dx i32) (param $dy i32) (result f32)
    (local $min i32)
    (local $max i32)
    ;; choose min and max between dx and dy
    local.get $dx
    local.get $dy
    i32.lt_s
    if
      local.get $dx
      local.set $min
      local.get $dy
      local.set $max
    else
      local.get $dy
      local.set $min
      local.get $dx
      local.set $max
    end
    ;; (max - min) + 1.4 * min
    local.get $max
    local.get $min
    i32.sub
    f32.convert_i32_s
    local.get $min
    f32.convert_i32_s
    f32.const 1.4
    f32.mul
    f32.add)
  (export "octile" (func $octile)))
