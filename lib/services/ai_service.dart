class AiService {
  static Future<String> detectAnomaly(String input) async {
    final analysis = analyzeAnomalyRisk(input);
    return analysis.summary;
  }

  static Future<String> guideDonations(String input) async {
    final plan = generateDonationPlan(input);
    return 'Route: ${plan.route}\n\nInstructions: ${plan.instructions}\n\nRedirect: ${plan.redirectHint}';
  }

  static String donationRedirectUrl(String input) {
    final lower = _normalizeText(input);

    if (lower.contains('food') || lower.contains('pagkain') || lower.contains('meal') || lower.contains('groceries')) {
      return 'https://www.google.com/search?q=food+bank+near+me';
    }

    if (lower.contains('clothes') || lower.contains('damit') || lower.contains('blanket') || lower.contains('winter') || lower.contains('saplot')) {
      return 'https://www.google.com/search?q=clothing+drive+near+me';
    }

    if (lower.contains('medical') || lower.contains('gamot') || lower.contains('medicine') || lower.contains('health')) {
      return 'https://www.google.com/search?q=medical+donation+center+near+me';
    }

    if (lower.contains('school') || lower.contains('eskwela') || lower.contains('books') || lower.contains('libro')) {
      return 'https://www.google.com/search?q=school+support+center+near+me';
    }

    return 'https://www.google.com/search?q=charity+donation+center+near+me';
  }

  static AnomalyRisk analyzeAnomalyRisk(String input) {
    final normalized = input.trim();
    if (normalized.isEmpty) {
      return AnomalyRisk(
        level: RiskLevel.low,
        score: 0,
        summary:
            'Please provide the activity details so the anomaly review can assess possible outcomes. This is only a guide, not a confirmed finding.',
        possibleOutcomes: const [
          'Possible outcome 1: no meaningful concerns are visible from the current data.',
          'Possible outcome 2: a small verification check may still be useful if the activity changes.',
          'Possible outcome 3: the event is not suspicious enough to confirm a risk without more context.',
        ],
      );
    }

    final lower = _normalizeText(normalized);
    final rules = <String, int>{
      'large': 2,
      'rapid': 2,
      'suspicious': 3,
      'unusual': 2,
      'repeated': 2,
      'round': 1,
      'duplicate': 2,
      'same time': 2,
      'urgent': 2,
      'manual review': 2,
      'high value': 3,
      'unexpected': 2,
      'off pattern': 2,
      'sudden': 2,
      'new account': 2,
      'multiple': 1,
      'missing': 1,
      'incorrect': 1,
      'biglang': 2,
      'bigla': 2,
      'madami': 1,
      'parang': 1,
      'hindi normal': 2,
      'di normal': 2,
      'may problema': 2,
      'may issue': 2,
      'mukhang': 1,
      'bago': 1,
      'kailangan': 1,
      'sobrang': 2,
      'hindi tama': 2,
      'di tama': 2,
      'palaging': 1,
      'paulit ulit': 2,
      'may issue': 2,
      'may problema': 2,
      'walang tamang': 1,
      'kulang': 1,
      'baliw': 0,
    };

    int score = 0;
    for (final entry in rules.entries) {
      if (lower.contains(entry.key)) {
        score += entry.value;
      }
    }

    final level = score >= 8
        ? RiskLevel.high
        : score >= 4
            ? RiskLevel.medium
            : RiskLevel.low;

    final outcomes = _buildPossibleOutcomes(level);
    final summary = _buildRiskSummary(level, score, outcomes);

    return AnomalyRisk(
      level: level,
      score: score,
      summary: summary,
      possibleOutcomes: outcomes,
    );
  }

  static DonationPlan generateDonationPlan(String input) {
    final normalized = input.trim();
    final lower = _normalizeText(normalized);

    if (lower.contains('food') || lower.contains('meal') || lower.contains('groceries') || lower.contains('pagkain') || lower.contains('kanin')) {
      return DonationPlan(
        route: 'Likely route: food bank or community pantry.',
        instructions:
            'Call ahead, confirm current needs, and ask whether cash, groceries, or meal supplies are most useful before visiting. If the user is elderly, keep the directions simple and clear.',
        redirectHint:
            'Redirect the user to the nearest food bank or pantry page and suggest a drop-off time that fits their schedule. Use simple language and offer a step-by-step plan.',
      );
    }

    if (lower.contains('clothes') || lower.contains('blanket') || lower.contains('winter') || lower.contains('damit') || lower.contains('saplot') || lower.contains('kumot')) {
      return DonationPlan(
        route: 'Likely route: clothing drive, family support centre, or shelter.',
        instructions:
            'Donate clean, usable items and confirm whether they need children’s, adult, or winter clothing before drop-off. A simple checklist helps elderly donors understand what is accepted.',
        redirectHint:
            'Redirect the user to the nearest support centre and confirm the exact donation categories accepted there. Keep the wording easy to follow.',
      );
    }

    if (lower.contains('medical') || lower.contains('medicine') || lower.contains('health') || lower.contains('gamot') || lower.contains('serbisyo sa kalusugan')) {
      return DonationPlan(
        route: 'Likely route: community clinic, hospital charity desk, or health outreach programme.',
        instructions:
            'Ask whether the organisation accepts the exact item or donation type, and validate whether cash, supplies, or medical support is most useful. Keep the directions gentle and helpful for older adults.',
        redirectHint:
            'Redirect the user to the closest relevant clinic or official charity desk and confirm contact details before they travel. Offer a phone call option if it is easier.',
      );
    }

    if (lower.contains('school') || lower.contains('education') || lower.contains('books') || lower.contains('eskwela') || lower.contains('libro') || lower.contains('aklat')) {
      return DonationPlan(
        route: 'Likely route: school support programme, youth charity, or literacy centre.',
        instructions:
            'Check whether they need books, stationery, school bags, or fee support before collecting items. Keep it simple and direct so it is easy to understand.',
        redirectHint:
            'Redirect the user to the nearest education-focused charity or school support office and tell them to call before donation. Offer clear steps in plain language.',
      );
    }

    return DonationPlan(
      route: 'Likely route: local charity hub or community donation centre.',
      instructions:
          'Call ahead, confirm the most urgent needs, and ask whether cash, food, clothing, or supplies are preferred for that day. Use plain language and a short checklist for easier understanding.',
      redirectHint:
          'Redirect the user to the nearest verified support centre and suggest they bring a prepared list of items before visiting. Offer to guide them step by step.',
    );
  }

  static String _normalizeText(String value) {
    return value
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9\s-]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static List<String> _buildPossibleOutcomes(RiskLevel level) {
    switch (level) {
      case RiskLevel.low:
        return const [
          'Possible outcome 1: the pattern looks routine and may be normal activity.',
          'Possible outcome 2: a minor reporting or timing difference could explain the variation.',
          'Possible outcome 3: the review should remain low priority unless more unusual signals appear.',
        ];
      case RiskLevel.medium:
        return const [
          'Possible outcome 1: the pattern may reflect a legitimate but unusual event that needs confirmation.',
          'Possible outcome 2: a duplicate entry, system mismatch, or process error could be behind the signal.',
          'Possible outcome 3: the signal may point to risk, but it is not enough to conclude wrongdoing without human review.',
        ];
      case RiskLevel.high:
        return const [
          'Possible outcome 1: the activity may indicate a high-risk pattern that deserves immediate review.',
          'Possible outcome 2: the pattern may reflect misuse, fraud, or an attempt to exploit the system.',
          'Possible outcome 3: an operational mistake or unusual workflow could also look risky, which is why human review is still required.',
        ];
    }
  }

  static String _buildRiskSummary(RiskLevel level, int score, List<String> outcomes) {
    final severity = switch (level) {
      RiskLevel.low => 'low priority',
      RiskLevel.medium => 'watchlist priority',
      RiskLevel.high => 'high priority',
    };

    final intro = 'Risk signal: $severity. Based on the input pattern, the system detected $score signal points.';
    final body = outcomes.join(' ');
    return '$intro $body This should be treated as a possible scenario, not a confirmed conclusion, and the final decision should be left to human review.';
  }
}

enum RiskLevel { low, medium, high }

class AnomalyRisk {
  final RiskLevel level;
  final int score;
  final String summary;
  final List<String> possibleOutcomes;

  const AnomalyRisk({
    required this.level,
    required this.score,
    required this.summary,
    required this.possibleOutcomes,
  });
}

class DonationPlan {
  final String route;
  final String instructions;
  final String redirectHint;
  final String redirectUrl;

  const DonationPlan({
    required this.route,
    required this.instructions,
    required this.redirectHint,
    required this.redirectUrl,
  });
}
