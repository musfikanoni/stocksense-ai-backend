const L = (kind) => ([symbol, name, exchange]) => ({ symbol, name, exchange, kind });
// The stocks the app follows. Real, listed US companies and three index funds.
export const stocks = [
    ["AAPL", "Apple Inc.", "NASDAQ"], ["MSFT", "Microsoft Corporation", "NASDAQ"], ["GOOGL", "Alphabet Inc.", "NASDAQ"],
    ["AMZN", "Amazon.com, Inc.", "NASDAQ"], ["TSLA", "Tesla, Inc.", "NASDAQ"], ["META", "Meta Platforms, Inc.", "NASDAQ"],
    ["NFLX", "Netflix, Inc.", "NASDAQ"], ["NVDA", "NVIDIA Corporation", "NASDAQ"], ["ADBE", "Adobe Inc.", "NASDAQ"],
    ["PYPL", "PayPal Holdings, Inc.", "NASDAQ"], ["INTC", "Intel Corporation", "NASDAQ"], ["CSCO", "Cisco Systems, Inc.", "NASDAQ"],
    ["AMD", "Advanced Micro Devices, Inc.", "NASDAQ"], ["UBER", "Uber Technologies, Inc.", "NYSE"], ["DIS", "The Walt Disney Company", "NYSE"],
].map(L("stock"));
export const indexes = [
    ["SPY", "S&P 500", "NYSE Arca"], ["QQQ", "NASDAQ 100", "NASDAQ"], ["IWM", "Russell 2000", "NYSE Arca"],
].map(L("index"));
export const plans = [
    { name: "Free", price: 0, highlight: false,
        features: ["5 stocks on watchlist", "Basic AI signals (delayed)", "End-of-day price alerts (3 max)", "Daily market summary", "Community forum access"] },
    { name: "Premium", price: 120, highlight: true,
        features: ["Unlimited watchlist", "Real-time AI buy/sell signals", "Unlimited instant alerts", "Multi-timeframe S/R analysis", "AI price target projections", "Volume confirmation signals", "Momentum & trend scoring", "Premium Discord community", "Priority email support", "API access (coming soon)"] },
];
export const policies = [
    { key: "privacy", title: "Privacy Policy", text: `Last Updated: June 2026

Welcome to StockSense. We respect your privacy and are committed to protecting your personal information.

1. Information We Collect

We may collect:
Name and email address
Account information
Subscription details
Usage activity
Device and technical information
Trading preferences and watchlist data

2. How We Use Your Information

We use your information to:
Provide and improve our services
Personalize your dashboard experience
Send alerts and account notices
Process subscription payments
Keep the platform secure

3. Sharing and Your Choices

We do not sell your personal information. You can update or delete your account data at any time from Settings.` },
    { key: "terms", title: "Terms & Conditions", text: `Last Updated: June 2026

By using StockSense you agree to these terms.

1. Educational Use

StockSense provides market analysis for educational purposes only. Nothing on the platform is financial advice.

2. Your Account

You are responsible for keeping your login details safe and for all activity under your account.

3. Subscriptions

Paid plans renew each billing period until cancelled. You can cancel at any time from Settings.

4. Changes

We may update these terms from time to time. Continued use means you accept the updated terms.` },
];
// Sample customers for the admin screens: [name, plan, billing, blocked, daysAgoJoined]
export const sampleUsers = [
    ["Jon Menson", "Premium", "Monthly", false, 20], ["Aisha Rahman", "Free", null, false, 18], ["Tom Becker", "Premium", "Yearly", false, 16],
    ["Sara Lin", "Free", null, false, 14], ["Ravi Patel", "Premium", "Monthly", false, 12], ["Maya Chen", "Free", null, true, 10],
    ["Omar Farouk", "Premium", "Monthly", false, 9], ["Lena Fischer", "Premium", "Yearly", false, 7], ["Diego Alvarez", "Free", null, false, 5],
    ["Nadia Karim", "Free", null, true, 4], ["Ethan Brooks", "Premium", "Monthly", false, 3], ["Priya Nair", "Free", null, false, 1],
];
//# sourceMappingURL=data.js.map