local accounts = redis.call('SMEMBERS', KEYS[1]);
  local data = {}
  for i, element in pairs(accounts)
   do 
    table.insert(data, redis.call('HGETALL', 'account:'..element:lower()))
  end;
return data;
