import 'package:daong_ai/services/ai_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('anomaly analysis gives a scored high-risk profile without certainty', () {
    final risk = AiService.analyzeAnomalyRisk(
      'Large amount sent to a new account, repeated twice in a short period, unexpected and urgent.',
    );

    expect(risk.level, RiskLevel.high);
    expect(risk.possibleOutcomes.length, 3);
    expect(risk.summary, contains('Possible outcome 1'));
    expect(risk.summary, contains('Possible outcome 2'));
    expect(risk.summary, contains('Possible outcome 3'));
    expect(risk.summary.toLowerCase(), isNot(contains('definitely')));
    expect(risk.summary.toLowerCase(), isNot(contains('certainly')));
    expect(risk.summary.toLowerCase(), contains('human review'));
  });

  test('donation plan recommends a route and redirect guidance', () {
    final plan = AiService.generateDonationPlan('We need food and blankets for families this week.');

    expect(plan.route.toLowerCase(), contains('food'));
    expect(plan.instructions.toLowerCase(), contains('call ahead'));
    expect(plan.redirectHint.toLowerCase(), contains('redirect'));
  });
}
