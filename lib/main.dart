import 'package:daong_ai/services/ai_service.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Daong AI',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6C63FF)),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF4F6FB),
      ),
      home: const AIDashboardPage(),
    );
  }
}

class AIDashboardPage extends StatefulWidget {
  const AIDashboardPage({super.key});

  @override
  State<AIDashboardPage> createState() => _AIDashboardPageState();
}

class _AIDashboardPageState extends State<AIDashboardPage> {
  final TextEditingController _anomalyController = TextEditingController();
  final TextEditingController _donationController = TextEditingController();

  String _anomalyResult = 'Upload or describe a transaction pattern to detect possible anomalies.';
  String _donationResult = 'Ask where donations are needed and I will suggest locations and next steps.';
  String _donationRedirect = 'https://www.google.com/search?q=charity+donation+center+near+me';

  bool _anomalyLoading = false;
  bool _donationLoading = false;

  Future<void> _runAnomalyCheck() async {
    final text = _anomalyController.text.trim();
    if (text.isEmpty) return;

    setState(() => _anomalyLoading = true);
    final response = await AiService.detectAnomaly(text);
    if (!mounted) return;

    setState(() {
      _anomalyResult = response;
      _anomalyLoading = false;
    });
  }

  Future<void> _runDonationGuide() async {
    final text = _donationController.text.trim();
    if (text.isEmpty) return;

    setState(() => _donationLoading = true);
    final response = await AiService.guideDonations(text);
    final redirectUrl = AiService.donationRedirectUrl(text);
    if (!mounted) return;

    setState(() {
      _donationResult = response;
      _donationRedirect = redirectUrl;
      _donationLoading = false;
    });
  }

  Future<void> _openRedirect() async {
    final url = Uri.parse(_donationRedirect);
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the redirect link right now.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Daong AI'),
        centerTitle: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'Daong AI Assist',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Simple help for review, donation support, and next steps.',
                      style: TextStyle(fontSize: 15, color: Colors.white70),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _buildPanel(
                title: 'Anomaly Detector',
                icon: Icons.warning_amber_rounded,
                accent: const Color(0xFFDC2626),
                controller: _anomalyController,
                onPressed: _runAnomalyCheck,
                isLoading: _anomalyLoading,
                result: _anomalyResult,
                isDonationPanel: false,
              ),
              const SizedBox(height: 20),
              _buildPanel(
                title: 'Donation Guide',
                icon: Icons.location_on_rounded,
                accent: const Color(0xFF16A34A),
                controller: _donationController,
                onPressed: _runDonationGuide,
                isLoading: _donationLoading,
                result: _donationResult,
                isDonationPanel: true,
                onRedirect: _openRedirect,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPanel({
    required String title,
    required IconData icon,
    required Color accent,
    required TextEditingController controller,
    required Future<void> Function() onPressed,
    required bool isLoading,
    required String result,
    required bool isDonationPanel,
    Future<void> Function()? onRedirect,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(12),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: accent.withAlpha(25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller,
            minLines: 2,
            maxLines: 6,
            decoration: InputDecoration(
              hintText: title == 'Anomaly Detector'
                  ? 'Example: large amount, repeated activity, unusual timing'
                  : 'Example: need food, clothes, medicine, or school supplies',
              filled: true,
              fillColor: const Color(0xFFF8FAFC),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: isLoading ? null : onPressed,
              icon: isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(isLoading ? 'Checking...' : 'Run help'),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              result,
              style: const TextStyle(fontSize: 14, height: 1.5),
            ),
          ),
          if (isDonationPanel && onRedirect != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: TextButton.icon(
                onPressed: onRedirect,
                icon: const Icon(Icons.open_in_new_rounded),
                label: const Text('Open donation location'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  backgroundColor: const Color(0xFFECFDF5),
                  foregroundColor: const Color(0xFF166534),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

