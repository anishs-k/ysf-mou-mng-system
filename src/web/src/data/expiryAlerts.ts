/**
 * Purpose: The prototype's MoU Expiry Alerts list - ten hand-written alert rows
 * (not derived from the 233 MoU rows) with the plant, scheme and HR contact its
 * detail dialog and CSV export show. Days-left figures are the prototype's own.
 */

export type ExpiryAlertStatus = "Expiring" | "Pending";

export interface ExpiryAlert {
  readonly company: string;
  readonly zone: string;
  readonly plant: string;
  readonly code: string;
  readonly scheme: string;
  readonly expires: string;
  readonly daysLeft: number;
  readonly hrContact: string;
  readonly status: ExpiryAlertStatus;
}

export const EXPIRY_ALERTS: readonly ExpiryAlert[] = [
  { company: "Reliance Industries Ltd", zone: "West", plant: "Jamnagar", code: "MoU-BVoc-2024-0112", scheme: "BVoc & DVoc", expires: "31 Aug 2026", daysLeft: 26, hrContact: "Anil Mehta · +91 98001 23456", status: "Expiring" },
  { company: "Tata Steel Jamshedpur", zone: "East", plant: "Jamshedpur", code: "MoU-WILP-2024-0089", scheme: "WILP", expires: "05 Sep 2026", daysLeft: 31, hrContact: "Priya Singh · +91 97001 44321", status: "Expiring" },
  { company: "HUL Ltd Silvassa", zone: "West", plant: "Silvassa", code: "MoU-FLEXI-2024-0103", scheme: "FLEXI", expires: "12 Sep 2026", daysLeft: 38, hrContact: "Rajan Nair · +91 99102 55678", status: "Expiring" },
  { company: "Honda Motorcycles", zone: "North", plant: "Manesar", code: "MoU-MSBTE-2024-0077", scheme: "MSBTE", expires: "20 Sep 2026", daysLeft: 46, hrContact: "Suresh Yadav · +91 98800 33221", status: "Expiring" },
  { company: "Sun Pharma Halol", zone: "West", plant: "Halol", code: "MoU-WILP-2024-0066", scheme: "WILP", expires: "25 Sep 2026", daysLeft: 51, hrContact: "Meena Sharma · +91 96001 77654", status: "Expiring" },
  { company: "Bharat Forge Ltd", zone: "West", plant: "Pune", code: "MoU-NAPS-2024-0141", scheme: "NAPS", expires: "28 Sep 2026", daysLeft: 24, hrContact: "Vijay Kulkarni · +91 98700 11122", status: "Pending" },
  { company: "Ashok Leyland Chennai", zone: "South", plant: "Chennai", code: "MoU-NATS-2024-0055", scheme: "NATS", expires: "02 Oct 2026", daysLeft: 57, hrContact: "Lakshmi Rao · +91 99400 88776", status: "Pending" },
  { company: "ONGC Hazira", zone: "West", plant: "Hazira", code: "MoU-WILP-2024-0099", scheme: "WILP", expires: "10 Oct 2026", daysLeft: 65, hrContact: "Deepak Joshi · +91 97700 55443", status: "Pending" },
  { company: "L&T Electrical Mumbai", zone: "West", plant: "Mumbai", code: "MoU-FLEXI-2024-0130", scheme: "FLEXI", expires: "15 Oct 2026", daysLeft: 29, hrContact: "Ramesh Patil · +91 98901 22334", status: "Pending" },
  { company: "Maruti Suzuki Gurgaon", zone: "North", plant: "Gurgaon", code: "MoU-MSBTE-2024-0088", scheme: "MSBTE", expires: "20 Oct 2026", daysLeft: 74, hrContact: "Aakash Verma · +91 96500 66789", status: "Expiring" },
];
