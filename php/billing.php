<?php
declare(strict_types=1);

// 31は「月末」。29・30日も、その月に存在しない場合は末日に丸めます。
function closingDate(DateTimeImmutable $month, int $day): DateTimeImmutable {
    return $month->setDate((int)$month->format('Y'), (int)$month->format('m'), min($day, (int)$month->format('t')));
}

// 表示月に対応する「前回締め日の翌日〜今回締め日」をカードごとに求めます。
function billingPeriod(string $month, int $closingDay): array {
    $closingMonth = new DateTimeImmutable($month . '-01');
    $end = closingDate($closingMonth, $closingDay);
    $start = closingDate($closingMonth->modify('-1 month'), $closingDay)->modify('+1 day');
    return ['period_start'=>$start->format('Y-m-d'), 'period_end'=>$end->format('Y-m-d')];
}

// 保存後は購入月ではなく、その購入が含まれる集計月へ画面を移動します。
function billingMonth(string $purchasedOn, int $closingDay): string {
    $date = new DateTimeImmutable($purchasedOn);
    $month = $date->modify('first day of this month');
    if ($date > closingDate($month, $closingDay)) $month = $month->modify('+1 month');
    return $month->format('Y-m');
}
