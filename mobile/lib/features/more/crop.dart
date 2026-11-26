import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:material_ui/material_ui.dart';

import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';

/// The part of the picture, in its own pixels, that shows in the square.
/// The picture is laid out to cover a square of `side` points, then moved by
/// `translation` and enlarged by `scale` (1 = just covering).
Rect cropRect({required Size image, required double side, required double scale, required Offset translation}) {
  // Points on screen per pixel of the picture, before zooming.
  final cover = side / (image.width < image.height ? image.width : image.height);
  final pixelsPerPoint = 1 / (cover * scale);
  final size = side * pixelsPerPoint;
  final left = (-translation.dx * pixelsPerPoint).clamp(0.0, image.width - size);
  final top = (-translation.dy * pixelsPerPoint).clamp(0.0, image.height - size);
  return Rect.fromLTWH(left, top, size, size);
}

/// Cuts the square out of the picture and returns it as a PNG of
/// [AppSizes.avatarPixels] pixels a side.
Future<Uint8List> renderCrop(ui.Image image, Rect source) async {
  const side = AppSizes.avatarPixels;
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawImageRect(image, source, Rect.fromLTWH(0, 0, side.toDouble(), side.toDouble()), Paint()..filterQuality = FilterQuality.high);
  final square = await recorder.endRecording().toImage(side, side);
  final bytes = await square.toByteData(format: ui.ImageByteFormat.png);
  return bytes!.buffer.asUint8List();
}

/// Move and zoom the photo inside a square, then Done. Pops with the PNG.
class CropPage extends StatefulWidget {
  const CropPage({super.key, required this.bytes});

  final Uint8List bytes;

  @override
  State<CropPage> createState() => _CropPageState();
}

class _CropPageState extends State<CropPage> {
  final _transform = TransformationController();
  ui.Image? _image;
  bool _failed = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _decode();
  }

  Future<void> _decode() async {
    try {
      final codec = await ui.instantiateImageCodec(widget.bytes);
      final frame = await codec.getNextFrame();
      if (mounted) setState(() => _image = frame.image);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  Future<void> _done(double side) async {
    final image = _image;
    if (image == null || _busy) return;
    setState(() => _busy = true);
    final matrix = _transform.value;
    final source = cropRect(
      image: Size(image.width.toDouble(), image.height.toDouble()),
      side: side,
      scale: matrix.getMaxScaleOnAxis(),
      translation: Offset(matrix.getTranslation().x, matrix.getTranslation().y),
    );
    final png = await renderCrop(image, source);
    if (mounted) Navigator.of(context).pop(png);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final image = _image;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.cropTitle, style: AppType.headline.copyWith(color: c.text)),
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) {
            final side = box.maxWidth - 2 * AppSpacing.page;
            return Padding(
              padding: const EdgeInsets.all(AppSpacing.page),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_failed)
                    Expanded(
                      child: EmptyState(icon: Icons.broken_image_outlined, title: l.photoFailed),
                    )
                  else if (image == null)
                    Skeleton(height: side, radius: AppRadii.card)
                  else
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.card),
                      child: SizedBox(
                        width: side,
                        height: side,
                        child: InteractiveViewer(
                          transformationController: _transform,
                          constrained: false,
                          minScale: 1,
                          maxScale: 5,
                          child: SizedBox(
                            // Laid out to cover the square: the shorter side fills it.
                            width: image.width >= image.height ? side * image.width / image.height : side,
                            height: image.height > image.width ? side * image.height / image.width : side,
                            child: RawImage(image: image, fit: BoxFit.cover),
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: AppSpacing.x4),
                  if (!_failed)
                    Text(
                      l.cropHint,
                      textAlign: TextAlign.center,
                      style: AppType.footnote.copyWith(color: c.textSecondary),
                    ),
                  const Spacer(),
                  PrimaryButton(label: l.done, onPressed: image == null ? null : () => _done(side), busy: _busy),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
