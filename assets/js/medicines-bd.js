/* Medicine catalogue for the prescription prototype — Bangladesh brands.
   PROTOTYPE SAMPLE ONLY: a few hundred commonly prescribed items for demonstration.
   Brand, strength and company details must be verified before any real use. The production system imports the
   full DGDA-registered catalogue and keeps it updated (pending decision PD-032).
   Format: "Brand|Generic|Strength|Form|Company" (company may be empty when not verified). */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});
  const RAW = `
Napa|Paracetamol|500 mg|Tab|Beximco
Napa Extra|Paracetamol + Caffeine|500 mg + 65 mg|Tab|Beximco
Napa Extend|Paracetamol (ER)|665 mg|Tab|Beximco
Napa|Paracetamol|120 mg/5 ml|Syrup|Beximco
Ace|Paracetamol|500 mg|Tab|Square
Ace Plus|Paracetamol + Caffeine|500 mg + 65 mg|Tab|Square
Ace XR|Paracetamol (ER)|665 mg|Tab|Square
Fast|Paracetamol|500 mg|Tab|Acme
Reset|Paracetamol|500 mg|Tab|Incepta
Clofenac|Diclofenac Sodium|50 mg|Tab|Square
Clofenac SR|Diclofenac Sodium (SR)|100 mg|Tab|Square
Clofenac|Diclofenac Diethylamine|1%|Gel|Square
Voltaren|Diclofenac Sodium|50 mg|Tab|Novartis
Voltaren Emulgel|Diclofenac Diethylamine|1.16%|Gel|Novartis
Flexi|Aceclofenac|100 mg|Tab|Square
Etorix|Etoricoxib|90 mg|Tab|Square
Etorix|Etoricoxib|120 mg|Tab|Square
Inflam|Ibuprofen|400 mg|Tab|Opsonin
Naprosyn|Naproxen|500 mg|Tab|Radiant
Naprosyn|Naproxen|250 mg|Tab|Radiant
Rolac|Ketorolac Tromethamine|10 mg|Tab|Renata
Celecoxib|Celecoxib|200 mg|Cap|
Meloxicam|Meloxicam|7.5 mg|Tab|
Meloxicam|Meloxicam|15 mg|Tab|
Indomethacin|Indomethacin|25 mg|Cap|
Piroxicam|Piroxicam|20 mg|Cap|
Tolperisone|Tolperisone HCl|50 mg|Tab|
Tolperisone|Tolperisone HCl|150 mg|Tab|
Eperisone|Eperisone HCl|50 mg|Tab|
Baclofen|Baclofen|10 mg|Tab|
Tizanidine|Tizanidine|2 mg|Tab|
Thiocolchicoside|Thiocolchicoside|4 mg|Cap|
Orphenadrine + Paracetamol|Orphenadrine Citrate + Paracetamol|35 mg + 450 mg|Tab|
Pregabalin|Pregabalin|25 mg|Cap|
Pregabalin|Pregabalin|50 mg|Cap|
Pregabalin|Pregabalin|75 mg|Cap|
Lyrica|Pregabalin|75 mg|Cap|Pfizer
Gabapentin|Gabapentin|300 mg|Cap|
Duloxetine|Duloxetine|30 mg|Cap|
Amitriptyline|Amitriptyline HCl|10 mg|Tab|
Amitriptyline|Amitriptyline HCl|25 mg|Tab|
Neuro-B|Vitamin B1 + B6 + B12|100 mg + 200 mg + 200 mcg|Tab|Square
Methylcobalamin|Mecobalamin|500 mcg|Tab|
Calbo-D|Calcium Carbonate + Vitamin D3|500 mg + 200 IU|Tab|Square
Coralcal-D|Calcium (Coral) + Vitamin D3|500 mg + 200 IU|Tab|Radiant
Calcium + D3|Calcium Carbonate + Vitamin D3|600 mg + 400 IU|Tab|
Vitamin D3|Cholecalciferol|2000 IU|Cap|
Vitamin D3|Cholecalciferol|20000 IU|Cap|
Vitamin D3|Cholecalciferol|40000 IU|Cap|
Bextram Gold|Multivitamin + Multimineral||Tab|Beximco
Ceevit|Vitamin C|250 mg|Tab (chewable)|Square
Glucosamine + Chondroitin|Glucosamine + Chondroitin Sulfate|250 mg + 200 mg|Tab|
Glucosamine|Glucosamine Sulfate|750 mg|Tab|
Diacerein|Diacerein|50 mg|Cap|
Seclo|Omeprazole|20 mg|Cap|Square
Seclo|Omeprazole|40 mg|Cap|Square
Losectil|Omeprazole|20 mg|Cap|Eskayef
Maxpro|Esomeprazole|20 mg|Tab|Renata
Maxpro|Esomeprazole|40 mg|Tab|Renata
Sergel|Esomeprazole|20 mg|Cap|Healthcare
Sergel|Esomeprazole|40 mg|Cap|Healthcare
Nexum|Esomeprazole|20 mg|Tab|Square
Pantonix|Pantoprazole|20 mg|Tab|Incepta
Pantonix|Pantoprazole|40 mg|Tab|Incepta
Rabeprazole|Rabeprazole Sodium|20 mg|Tab|
Neoceptin-R|Ranitidine|150 mg|Tab|Beximco
Famotidine|Famotidine|20 mg|Tab|
Domperidone|Domperidone|10 mg|Tab|
Ondansetron|Ondansetron|8 mg|Tab|
Flatameal DS|Antacid (Al(OH)3 + Mg(OH)2 + Simethicone)||Suspension|Square
Antacid|Aluminium Hydroxide + Magnesium Hydroxide||Tab (chewable)|
Lactulose|Lactulose|3.35 g/5 ml|Syrup|
Ispaghula Husk|Ispaghula Husk|3.5 g|Sachet|
Fexo|Fexofenadine HCl|120 mg|Tab|Square
Fexo|Fexofenadine HCl|180 mg|Tab|Square
Alatrol|Cetirizine HCl|10 mg|Tab|Square
Tofen|Ketotifen|1 mg|Tab|Beximco
Monas|Montelukast|10 mg|Tab|Acme
Loratadine|Loratadine|10 mg|Tab|
Desloratadine|Desloratadine|5 mg|Tab|
Rupatadine|Rupatadine|10 mg|Tab|
Zimax|Azithromycin|500 mg|Tab|Square
Azithrocin|Azithromycin|500 mg|Tab|Beximco
Cef-3|Cefixime|200 mg|Cap|Square
Cefuroxime|Cefuroxime Axetil|250 mg|Tab|
Cefuroxime|Cefuroxime Axetil|500 mg|Tab|
Ciprocin|Ciprofloxacin|500 mg|Tab|Square
Levofloxacin|Levofloxacin|500 mg|Tab|
Amoxicillin|Amoxicillin|500 mg|Cap|
Amoxicillin + Clavulanic Acid|Amoxicillin + Clavulanic Acid|500 mg + 125 mg|Tab|
Flucloxacillin|Flucloxacillin|500 mg|Cap|
Doxycycline|Doxycycline|100 mg|Cap|
Filmet|Metronidazole|400 mg|Tab|Beximco
Amodis|Metronidazole|400 mg|Tab|Square
Nitrofurantoin|Nitrofurantoin|100 mg|Cap|
Fluconazole|Fluconazole|150 mg|Cap|
Prednisolone|Prednisolone|5 mg|Tab|
Prednisolone|Prednisolone|10 mg|Tab|
Prednisolone|Prednisolone|20 mg|Tab|
Deflazacort|Deflazacort|6 mg|Tab|
Deflazacort|Deflazacort|24 mg|Tab|
Dexamethasone|Dexamethasone|0.5 mg|Tab|
Methylprednisolone|Methylprednisolone|4 mg|Tab|
Methylprednisolone|Methylprednisolone|16 mg|Tab|
Colchicine|Colchicine|0.5 mg|Tab|
Febuxostat|Febuxostat|40 mg|Tab|
Allopurinol|Allopurinol|100 mg|Tab|
Rivotril|Clonazepam|0.5 mg|Tab|Roche
Disopan|Clonazepam|0.5 mg|Tab|Incepta
Sedil|Diazepam|5 mg|Tab|Square
Escitalopram|Escitalopram|10 mg|Tab|
Sertraline|Sertraline|50 mg|Tab|
Melatonin|Melatonin|3 mg|Tab|
Amlodipine|Amlodipine|5 mg|Tab|
Angilock|Losartan Potassium|50 mg|Tab|Square
Osartil|Losartan Potassium|50 mg|Tab|Incepta
Bisoprolol|Bisoprolol Fumarate|2.5 mg|Tab|
Bisoprolol|Bisoprolol Fumarate|5 mg|Tab|
Atova|Atorvastatin|10 mg|Tab|Beximco
Atova|Atorvastatin|20 mg|Tab|Beximco
Rosuvastatin|Rosuvastatin|10 mg|Tab|
Ecosprin|Aspirin|75 mg|Tab|ACI
Clopidogrel|Clopidogrel|75 mg|Tab|
Metformin|Metformin HCl|500 mg|Tab|
Metformin|Metformin HCl|850 mg|Tab|
Glimepiride|Glimepiride|2 mg|Tab|
Gliclazide|Gliclazide (MR)|30 mg|Tab|
Sitagliptin|Sitagliptin|50 mg|Tab|
Linagliptin|Linagliptin|5 mg|Tab|
Empagliflozin|Empagliflozin|10 mg|Tab|
Levothyroxine|Levothyroxine Sodium|50 mcg|Tab|
Iron + Folic Acid|Ferrous Fumarate + Folic Acid|200 mg + 0.2 mg|Cap|
Folic Acid|Folic Acid|5 mg|Tab|
Zinc|Zinc Sulfate|20 mg|Tab|
Magnesium|Magnesium Hydroxide|400 mg|Tab|
Omega-3|Omega-3 Fatty Acids|1000 mg|Cap|
Adovas|Adhatoda vasica (herbal)||Syrup|Square
Dextromethorphan|Dextromethorphan|10 mg/5 ml|Syrup|
Salbutamol|Salbutamol|100 mcg/dose|Inhaler|
Oral Saline|ORS||Sachet|
Methyl Salicylate + Menthol|Methyl Salicylate + Menthol||Cream|
Ketoprofen|Ketoprofen|2.5%|Gel|
Piroxicam|Piroxicam|0.5%|Gel|
Capsaicin|Capsaicin|0.075%|Cream|
Lidocaine|Lidocaine|5%|Patch|
Diclofenac|Diclofenac Sodium|1.3%|Patch|
Hydrocortisone|Hydrocortisone|1%|Cream|
Mupirocin|Mupirocin|2%|Ointment|
Diclofenac|Diclofenac Sodium|75 mg/3 ml|Inj|
Ketorolac|Ketorolac Tromethamine|30 mg/ml|Inj|
Methylcobalamin|Mecobalamin|500 mcg/ml|Inj|
Triamcinolone|Triamcinolone Acetonide|40 mg/ml|Inj|
Methylprednisolone Acetate|Methylprednisolone Acetate|40 mg/ml|Inj|
Hyaluronic Acid|Sodium Hyaluronate|20 mg/2 ml|Inj (intra-articular)|
Moxifloxacin|Moxifloxacin|0.5%|Eye drop|
Carboxymethylcellulose|Carboxymethylcellulose|0.5%|Eye drop|
`;
  PP.MEDICINES = RAW.trim().split('\n').map((line, i) => {
    const [brand, generic, strength, form, company] = line.split('|').map((s) => (s || '').trim());
    return { id: `MED-${String(i + 1).padStart(4, '0')}`, brand, generic, strength, form, company };
  });
  PP.medLabel = (m) => `${m.form ? m.form + '. ' : ''}${m.brand}${m.strength ? ' ' + m.strength : ''}`;
})();
