import 'package:daong_ai/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('app shows AI assistant panels', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('Daong AI'), findsOneWidget);
    expect(find.text('Anomaly Detector'), findsOneWidget);
    expect(find.text('Donation Guide'), findsOneWidget);
    expect(find.byType(TextField), findsWidgets);
  });
}
