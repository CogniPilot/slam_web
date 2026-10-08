model PeriodicControllerClock
  parameter Real period = 0.01;
  discrete output Real ticks(start=0, fixed=true);
algorithm
  when sample(0, period) then
    ticks := pre(ticks)+1;
  end when;
end PeriodicControllerClock;
