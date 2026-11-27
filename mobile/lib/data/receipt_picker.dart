import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

import 'receipts.dart';

/// A receipt from the camera, the gallery, or a PDF file. A picture is shrunk
/// on the way in to at most 2000 px on its longer side; a PDF is taken as it is.
Future<PickedReceipt?> pickReceipt(ReceiptSource source) async {
  if (source == ReceiptSource.file) {
    final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf']);
    return file == null ? null : PickedReceipt(name: file.name, bytes: await file.readAsBytes());
  }
  final photo = await ImagePicker().pickImage(
    source: source == ReceiptSource.camera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 2000,
    maxHeight: 2000,
    imageQuality: 85,
  );
  return photo == null ? null : PickedReceipt(name: photo.name, bytes: await photo.readAsBytes());
}
