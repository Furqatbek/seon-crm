import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

import 'more.dart';

/// Takes a photo or picks one from the gallery. The picture is shrunk on the
/// way in: a profile photo never needs more than this.
Future<Uint8List?> pickPhoto(PhotoSource source) async {
  final file = await ImagePicker().pickImage(
    source: source == PhotoSource.camera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 2000,
    maxHeight: 2000,
    imageQuality: 90,
  );
  return file?.readAsBytes();
}
