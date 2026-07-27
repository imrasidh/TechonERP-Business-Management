/**
 * Realistic Computer Shop master-data catalog for certification.
 * Names are real retail SKUs — no Product 001 style fillers.
 */

export var CERT_CATEGORIES = [
  "Laptops",
  "Desktops",
  "Components",
  "Storage",
  "Monitors",
  "Peripherals",
  "Networking",
  "Accessories",
  "Repair Parts",
  "Services",
];

export var CERT_BRANDS = [
  "Dell", "HP", "Lenovo", "ASUS", "Acer", "Apple", "Samsung", "Kingston",
  "WD", "Seagate", "Logitech", "TP-Link", "Canon", "Corsair", "MSI",
];

/** Stock SKUs — cost/price in LKR-style units (configurable currency symbol separately). */
export var CERT_PRODUCT_TEMPLATES = [
  { name: "Dell Latitude 5410", cat: "Laptops", brand: "Dell", cost: 125000, price: 155000 },
  { name: "Dell Latitude 7420", cat: "Laptops", brand: "Dell", cost: 168000, price: 205000 },
  { name: "Lenovo ThinkPad T480", cat: "Laptops", brand: "Lenovo", cost: 98000, price: 122000 },
  { name: "HP EliteBook 840 G6", cat: "Laptops", brand: "HP", cost: 112000, price: 139000 },
  { name: "HP ProBook 450 G8", cat: "Laptops", brand: "HP", cost: 135000, price: 165000 },
  { name: "ASUS VivoBook 15", cat: "Laptops", brand: "ASUS", cost: 88000, price: 109000 },
  { name: "Acer Aspire 5", cat: "Laptops", brand: "Acer", cost: 79000, price: 98500 },
  { name: "MacBook Air M2", cat: "Laptops", brand: "Apple", cost: 285000, price: 339000 },
  { name: "Dell OptiPlex 7090", cat: "Desktops", brand: "Dell", cost: 95000, price: 118000 },
  { name: "HP ProDesk 400 G7", cat: "Desktops", brand: "HP", cost: 72000, price: 89900 },
  { name: "Custom Gaming PC i5", cat: "Desktops", brand: "MSI", cost: 165000, price: 199000 },
  { name: "Kingston 8GB DDR4", cat: "Components", brand: "Kingston", cost: 4200, price: 5900 },
  { name: "Kingston 16GB DDR4", cat: "Components", brand: "Kingston", cost: 8500, price: 11500 },
  { name: "Corsair 32GB DDR5", cat: "Components", brand: "Corsair", cost: 18500, price: 24000 },
  { name: "Intel Core i5-13400", cat: "Components", brand: "Intel", cost: 42000, price: 52000 },
  { name: "AMD Ryzen 5 5600", cat: "Components", brand: "AMD", cost: 28000, price: 34500 },
  { name: "MSI B550 Motherboard", cat: "Components", brand: "MSI", cost: 22000, price: 28500 },
  { name: "Samsung 980 NVMe 500GB", cat: "Storage", brand: "Samsung", cost: 9800, price: 12900 },
  { name: "Samsung 980 NVMe 1TB", cat: "Storage", brand: "Samsung", cost: 14500, price: 18900 },
  { name: "WD Blue 2TB HDD", cat: "Storage", brand: "WD", cost: 9800, price: 12500 },
  { name: "Seagate 4TB External", cat: "Storage", brand: "Seagate", cost: 16500, price: 21000 },
  { name: "Dell 24\" FHD Monitor", cat: "Monitors", brand: "Dell", cost: 28000, price: 35500 },
  { name: "LG 27\" IPS Monitor", cat: "Monitors", brand: "LG", cost: 52000, price: 64900 },
  { name: "Logitech MK270 Combo", cat: "Peripherals", brand: "Logitech", cost: 4200, price: 5900 },
  { name: "Redragon K552 Keyboard", cat: "Peripherals", brand: "Redragon", cost: 6500, price: 8900 },
  { name: "Razer DeathAdder Mouse", cat: "Peripherals", brand: "Razer", cost: 8500, price: 11500 },
  { name: "TP-Link Archer C6", cat: "Networking", brand: "TP-Link", cost: 7500, price: 9900 },
  { name: "D-Link 8-Port Switch", cat: "Networking", brand: "D-Link", cost: 4200, price: 5500 },
  { name: "Dell 65W Adapter", cat: "Accessories", brand: "Dell", cost: 4500, price: 6900 },
  { name: "HP 65W Adapter", cat: "Accessories", brand: "HP", cost: 4200, price: 6500 },
  { name: "Universal Laptop Battery", cat: "Repair Parts", brand: "Generic", cost: 6500, price: 9800 },
  { name: "Laptop Screen 15.6 LED", cat: "Repair Parts", brand: "Generic", cost: 12000, price: 18500 },
  { name: "Laptop Keyboard Replacement", cat: "Repair Parts", brand: "Generic", cost: 3500, price: 5500 },
  { name: "Thermal Paste Tube", cat: "Repair Parts", brand: "Generic", cost: 450, price: 900 },
  { name: "Laptop Bag 15.6\"", cat: "Accessories", brand: "Generic", cost: 2200, price: 3500 },
  { name: "USB-C Hub 7-in-1", cat: "Accessories", brand: "Generic", cost: 3500, price: 4900 },
  { name: "HDMI Cable 2m", cat: "Accessories", brand: "Generic", cost: 650, price: 1200 },
  { name: "Windows 11 Pro License", cat: "Accessories", brand: "Microsoft", cost: 18500, price: 24000 },
];

export var CERT_SERVICE_SKUS = [
  { name: "Laptop Repair Labour", price: 4500 },
  { name: "Screen Replacement Labour", price: 3500 },
  { name: "Data Recovery Service", price: 8500 },
  { name: "Virus Removal", price: 2500 },
  { name: "OS Installation", price: 3000 },
  { name: "Network Setup", price: 5500 },
  { name: "Annual Maintenance", price: 12000 },
];

export var CERT_CUSTOMER_NAMES = [
  "Rashid Ahmed", "Tech Solutions Lanka", "Colombo IT Hub", "Smart Systems Pvt Ltd",
  "Nimal Perera", "Green Valley School", "City Computers", "Digital Wave Agency",
  "Ayub Khan", "Lanka Enterprises", "Pixel Print House", "Ocean View Hotel",
  "Sunrise Academy", "Metro Trading", "Silva & Sons", "Cyber Cafe Central",
  "Horizon Logistics", "Pearl Accounting", "Kandy Tech Mart", "Galle Bay Resort",
  "Unity Plaza Walk-in Desk", "Negombo Net Cafe", "Matara Digital", "Kurunegala Systems",
  "Jaffna IT Services", "Batticaloa Computers", "Anuradhapura Tech", "Ratnapura Office Supplies",
  "Dehiwala Print Shop", "Nugegoda Student Hub", "Rajagiriya Clinic IT", "Bambalapitiya Media",
];

export var CERT_SUPPLIER_NAMES = [
  "Tech Distributors Lanka", "Ingram Micro SL", "Singer PLC IT Division", "Redline Technologies",
  "Barclays Computers", "Unity Plaza Wholesale", "PC House Imports", "Global IT Supplies",
  "Colombo Components", "Mega Storage Lanka", "Network Pro SL", "Print Solutions Wholesale",
  "Chipset Lanka", "Display Direct", "Power Adapter Hub", "OEM Parts SL",
  "SoftLicense Distributors", "Enterprise Hardware Co", "Repair Parts Depot", "Cable World Wholesale",
];

export var CERT_OTHER_NAMES = [
  "CityLink Couriers", "Unity Plaza Management", "Lakpura Leasing", "Office Mart Lanka",
  "Metro Property Services", "QuickShip Logistics", "Showroom Landlord", "Utility Board Contact",
];

export var CERT_REPAIR_PROBLEMS = [
  "No power / dead board", "Screen flickering", "Keyboard not working", "Slow performance / virus",
  "HDD failure", "Battery not charging", "Wi-Fi not connecting", "Overheating / fan noise",
  "Blue screen errors", "Liquid damage assessment", "Adapter failure", "Trackpad intermittent",
];

export var CERT_BANKS = ["BOC", "HNB", "Sampath", "Peoples", "Commercial", "DFCC", "NDB"];

export var CERT_EXPENSE_CATS = [
  "Transport", "Utilities", "Salaries", "Rent", "Maintenance", "Marketing", "Office", "Courier",
];
