"""Reproduce the bundled weight-only INT8 IS-Net from the rembg FP32 export.

Usage: python scripts/quantize-isnet.py source.onnx assets/models/isnet-int8.onnx
Requires numpy and onnx. No calibration photos are embedded in the model.
"""
import hashlib
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper

source, destination = map(Path, sys.argv[1:])
with source.open('rb') as stream:
    if hashlib.file_digest(stream, 'md5').hexdigest() != 'fc16ebd8b0c10d971d3513d564d01e29':
        raise ValueError('Expected the rembg isnet-general-use.onnx export')
model = onnx.load(source)
weights = {node.input[1] for node in model.graph.node if node.op_type == 'Conv'}
initializers, dequantizers = [], []
for tensor in model.graph.initializer:
    if tensor.name not in weights:
        initializers.append(tensor)
        continue
    values = numpy_helper.to_array(tensor)
    axes = tuple(range(1, values.ndim))
    scales = np.maximum(np.max(np.abs(values), axis=axes) / 127, 1e-8).astype(np.float32)
    quantized = np.clip(np.rint(values / scales.reshape((-1,) + (1,) * (values.ndim - 1))), -127, 127).astype(np.int8)
    name = tensor.name
    initializers.extend([
        numpy_helper.from_array(quantized, name + '_int8'),
        numpy_helper.from_array(scales, name + '_scale'),
        numpy_helper.from_array(np.zeros_like(scales, dtype=np.int8), name + '_zero'),
    ])
    dequantizers.append(helper.make_node('DequantizeLinear', [name + '_int8', name + '_scale', name + '_zero'], [name], axis=0))
nodes = list(model.graph.node)
del model.graph.initializer[:]
model.graph.initializer.extend(initializers)
del model.graph.node[:]
model.graph.node.extend(dequantizers + nodes)
model.producer_name = 'Banana Canvas / IS-Net per-channel INT8 weights'
model.doc_string = 'IS-Net general-use; Conv weights quantized INT8 per output channel, activations FP32. Source: xuebinqin/DIS via danielgatis/rembg.'
onnx.checker.check_model(model)
destination.parent.mkdir(parents=True, exist_ok=True)
onnx.save(model, destination)
with destination.open('rb') as stream:
    print('sha256:', hashlib.file_digest(stream, 'sha256').hexdigest())
print('bytes:', destination.stat().st_size)
