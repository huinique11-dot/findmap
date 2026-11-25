import openpyxl, json, sys
out=[]
for f,kind in [(sys.argv[1],'school'),(sys.argv[2],'place')]:
    ws=openpyxl.load_workbook(f,data_only=True).active
    rows=list(ws.iter_rows(values_only=True))
    for r in rows[1:]:
        if not r[0]: continue
        s=lambda v: (str(v).strip() if v is not None else '')
        out.append(dict(name=s(r[0]),cat=s(r[1]),addr=s(r[2]),tel=s(r[3]),kind=kind))
json.dump(out,open(sys.argv[3],'w'),ensure_ascii=False,indent=0)
print(len(out))
